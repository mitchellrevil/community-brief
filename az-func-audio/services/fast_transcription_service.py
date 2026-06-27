"""Hybrid Azure Speech transcription service."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta
from enum import Enum
from typing import Any, Dict, Iterable, Optional, Tuple
from urllib.parse import unquote, urlparse

import requests
import structlog
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import AzureError

from config import AppConfig


logger = structlog.get_logger(__name__)

TIMESTAMP_PARSE_ERRORS = (ValueError, TypeError, OverflowError)


class TranscriptionAPI(Enum):
    """Azure Speech API types used by this service."""

    FAST = "fast"
    BATCH = "batch"


class TranscriptionServiceError(Exception):
    """Raised when transcription submission, polling, or parsing fails."""


TRANSCRIPTION_ERRORS = (TranscriptionServiceError, AzureError, RuntimeError, ValueError, TypeError, OSError)


@dataclass(frozen=True)
class TranscriptSegment:
    """Normalized transcript segment produced by either Speech API."""

    text: str
    speaker: Optional[str] = None
    timestamp: Optional[str] = None
    confidence: Optional[float] = None


class FastTranscriptionService:
    """Route audio to Fast or Batch Speech APIs and normalize the results."""

    FAST_API_MAX_DURATION_SECONDS = 7200
    FAST_API_MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024
    FAST_API_VERSION = "2025-10-15"
    FAST_REQUEST_TIMEOUT = 300
    BATCH_SUBMISSION_TIMEOUT = 30
    STATUS_REQUEST_TIMEOUT = 30
    RESULT_REQUEST_TIMEOUT = 60
    DEFAULT_STATUS_TIMEOUT = 18000
    DEFAULT_POLL_INTERVAL = 5
    STATUS_LOG_INTERVAL_SECONDS = 60

    def __init__(
        self,
        config: AppConfig,
        credential: Any = None,
        storage_service: Any = None,
    ) -> None:
        self.config = config
        self.logger = logger
        self.storage_service = storage_service
        self.session = requests.Session()
        self._fast_results_cache: Dict[str, Dict[str, Any]] = {}
        self.speech_key = getattr(config, "speech_key", None)
        self.storage_credential = getattr(config, "storage_account_key", None) or credential

        if self.speech_key:
            self.credential = None
        elif credential is not None:
            self.credential = credential
        else:
            try:
                from azure.identity import DefaultAzureCredential

                self.credential = DefaultAzureCredential()
            except (ImportError, ModuleNotFoundError):
                self.credential = None

        speech_endpoint = getattr(config, "speech_endpoint", None)
        speech_deployment = getattr(config, "speech_deployment", None)
        if speech_endpoint:
            base_endpoint = speech_endpoint.rstrip("/")
            self.batch_endpoint = f"{base_endpoint}/speechtotext/v3.2"
            self.fast_endpoint = (
                f"{base_endpoint}/speechtotext/transcriptions:transcribe"
            )
            speech_resource = urlparse(base_endpoint).netloc or base_endpoint
        elif speech_deployment:
            speech_resource = speech_deployment
            self.batch_endpoint = (
                f"https://{speech_resource}.cognitiveservices.azure.com/speechtotext/v3.2"
            )
            self.fast_endpoint = (
                "https://"
                f"{speech_resource}.cognitiveservices.azure.com/"
                "speechtotext/transcriptions:transcribe"
            )
        else:
            raise ValueError(
                "Either AZURE_SPEECH_ENDPOINT or AZURE_SPEECH_DEPLOYMENT must be configured"
            )

        self.fast_api_enabled = bool(getattr(config, "enable_fast_transcription", True))
        self.locale = getattr(config, "speech_transcription_locale", None) or "en-GB"
        self.max_speakers = int(getattr(config, "speech_max_speakers", 10))
        self.fast_duration_threshold_minutes = min(
            float(getattr(config, "fast_transcription_duration_threshold_minutes", 120)),
            self.FAST_API_MAX_DURATION_SECONDS / 60,
        )

        self.logger.info(
            "transcription_service_initialized",
            speech_resource=speech_resource,
            fast_api_enabled=self.fast_api_enabled,
            locale=self.locale,
            max_speakers=self.max_speakers,
            fast_duration_threshold_minutes=self.fast_duration_threshold_minutes,
        )

    def _cache_fast_result(self, transcription_id: str, result_data: Dict[str, Any]) -> None:
        self._fast_results_cache[transcription_id] = result_data

    def _get_auth_token(self) -> str:
        """Acquire a bearer token for Azure Speech."""
        if self.credential is None:
            raise TranscriptionServiceError("Azure credential is not available")

        try:
            token = self.credential.get_token(
                "https://cognitiveservices.azure.com/.default"
            )
        except TRANSCRIPTION_ERRORS as exc:
            raise TranscriptionServiceError(
                f"Failed to acquire authentication token: {exc}"
            ) from exc

        return token.token

    def _get_headers(self, api_type: TranscriptionAPI) -> Dict[str, str]:
        if self.speech_key:
            headers = {"Ocp-Apim-Subscription-Key": self.speech_key}
        else:
            token = self._get_auth_token()
            headers = {"Authorization": f"Bearer {token}"}
        if api_type == TranscriptionAPI.BATCH:
            headers["Content-Type"] = "application/json"
        return headers

    def _parse_blob_url(self, blob_url: str) -> Tuple[str, str, str]:
        parsed = urlparse(blob_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise TranscriptionServiceError(f"Invalid blob URL: {blob_url}")

        path = parsed.path.lstrip("/")
        container_name, separator, blob_name = path.partition("/")
        if not separator or not container_name or not blob_name:
            raise TranscriptionServiceError(f"Invalid blob URL: {blob_url}")

        return parsed.netloc.split(".")[0], container_name, unquote(blob_name)

    def _get_blob_file_size(self, blob_url: str) -> Optional[int]:
        try:
            account_name, container_name, blob_name = self._parse_blob_url(blob_url)
            blob_service_client = BlobServiceClient(
                account_url=f"https://{account_name}.blob.core.windows.net",
                credential=self.storage_credential,
            )
            blob_client = blob_service_client.get_blob_client(
                container=container_name,
                blob=blob_name,
            )
            return blob_client.get_blob_properties().size
        except TRANSCRIPTION_ERRORS as exc:
            self.logger.warning(
                "transcription_blob_size_lookup_failed",
                blob_url=blob_url[:120],
                error=str(exc),
                error_type=type(exc).__name__,
            )
            return None

    def _download_audio_from_blob(self, blob_url: str) -> bytes:
        try:
            account_name, container_name, blob_name = self._parse_blob_url(blob_url)
            blob_service_client = BlobServiceClient(
                account_url=f"https://{account_name}.blob.core.windows.net",
                credential=self.storage_credential,
            )
            blob_client = blob_service_client.get_blob_client(
                container=container_name,
                blob=blob_name,
            )
            return blob_client.download_blob().readall()
        except TRANSCRIPTION_ERRORS as exc:
            raise TranscriptionServiceError(f"Failed to download audio: {exc}") from exc

    def _extract_error_message(self, response: requests.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text.strip() or response.reason

        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or error.get("code")
                if message:
                    return str(message)
            message = payload.get("message")
            if message:
                return str(message)

        return json.dumps(payload)[:500]

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        operation: str,
        headers: Optional[Dict[str, str]] = None,
        timeout: int,
        expected_statuses: Iterable[int],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                timeout=timeout,
                **kwargs,
            )
        except requests.RequestException as exc:
            raise TranscriptionServiceError(f"Failed to {operation}: {exc}") from exc

        if response.status_code not in set(expected_statuses):
            detail = self._extract_error_message(response)
            raise TranscriptionServiceError(
                f"Failed to {operation}: HTTP {response.status_code} - {detail}"
            )

        try:
            return response.json()
        except ValueError as exc:
            raise TranscriptionServiceError(
                f"Failed to {operation}: response was not valid JSON"
            ) from exc

    def _download_result_json(
        self,
        result_url: str,
        auth_headers: Dict[str, str],
    ) -> Dict[str, Any]:
        try:
            return self._request_json(
                "GET",
                result_url,
                operation="download transcription result",
                headers=None,
                timeout=self.RESULT_REQUEST_TIMEOUT,
                expected_statuses=(200,),
            )
        except TranscriptionServiceError as exc:
            message = str(exc)
            if "HTTP 401" not in message and "HTTP 403" not in message:
                raise

        return self._request_json(
            "GET",
            result_url,
            operation="download transcription result",
            headers=auth_headers,
            timeout=self.RESULT_REQUEST_TIMEOUT,
            expected_statuses=(200,),
        )

    def determine_api(
        self,
        blob_url: str,
        file_size_bytes: Optional[int] = None,
        audio_duration_minutes: Optional[float] = None,
    ) -> Tuple[TranscriptionAPI, str]:
        if not self.fast_api_enabled:
            return TranscriptionAPI.BATCH, "Fast API disabled via configuration"

        if file_size_bytes is None:
            file_size_bytes = self._get_blob_file_size(blob_url)

        if file_size_bytes is None:
            return (
                TranscriptionAPI.BATCH,
                "Blob size unavailable; using Batch API for reliability",
            )

        if file_size_bytes >= self.FAST_API_MAX_FILE_SIZE_BYTES:
            size_mb = file_size_bytes / (1024 * 1024)
            return (
                TranscriptionAPI.BATCH,
                f"File size ({size_mb:.2f} MB) exceeds Fast API limit",
            )

        if audio_duration_minutes is None:
            return (
                TranscriptionAPI.BATCH,
                "Audio duration unavailable; using Batch API for reliability",
            )

        if audio_duration_minutes >= self.fast_duration_threshold_minutes:
            return (
                TranscriptionAPI.BATCH,
                f"Audio duration ({audio_duration_minutes:.1f} mins) exceeds Fast API limit",
            )

        return (
            TranscriptionAPI.FAST,
            "Fast API eligible based on known file size and duration",
        )

    def _should_fallback_to_batch(self, error: Exception) -> bool:
        message = str(error).lower()
        markers = (
            "duration",
            "too long",
            "file size",
            "content length",
            "413",
            "request entity too large",
            "without any recognized text",
        )
        return any(marker in message for marker in markers)

    def submit_transcription_job(
        self,
        blob_url: str,
        file_size_bytes: Optional[int] = None,
        audio_duration_minutes: Optional[float] = None,
    ) -> str:
        api_type, reason = self.determine_api(
            blob_url,
            file_size_bytes=file_size_bytes,
            audio_duration_minutes=audio_duration_minutes,
        )
        self.logger.info(
            "transcription_job_submitting",
            api_type=api_type.value,
            reason=reason,
            blob_url=blob_url[:120],
        )

        try:
            if api_type == TranscriptionAPI.FAST:
                return self._submit_fast_transcription(blob_url)
            return self._submit_batch_transcription(blob_url)
        except TRANSCRIPTION_ERRORS as exc:
            if api_type == TranscriptionAPI.FAST and self._should_fallback_to_batch(exc):
                self.logger.warning(
                    "transcription_fast_submission_fallback_to_batch",
                    blob_url=blob_url[:120],
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                return self._submit_batch_transcription(blob_url)
            raise

    def _submit_fast_transcription(self, blob_url: str) -> str:
        audio_data = self._download_audio_from_blob(blob_url)
        headers = self._get_headers(TranscriptionAPI.FAST)
        definition = {
            "locales": [self.locale],
            "diarization": {"enabled": True, "maxSpeakers": self.max_speakers},
            "profanityFilterMode": "None",
        }
        filename = os.path.basename(urlparse(blob_url).path) or "audio"
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        files = {
            "audio": (filename, audio_data, content_type),
            "definition": (None, json.dumps(definition), "application/json"),
        }

        result_data = self._request_json(
            "POST",
            f"{self.fast_endpoint}?api-version={self.FAST_API_VERSION}",
            operation="submit fast transcription",
            headers=headers,
            timeout=self.FAST_REQUEST_TIMEOUT,
            expected_statuses=(200,),
            files=files,
        )

        self._require_transcript(
            self._format_fast_transcription(result_data),
            "Fast transcription",
        )
        transcription_id = f"fast_{uuid.uuid4().hex}"
        self._cache_fast_result(transcription_id, result_data)
        return transcription_id

    def _submit_batch_transcription(self, blob_url: str) -> str:
        content_url = blob_url
        if self.storage_service is not None:
            try:
                content_url = self.storage_service.generate_sas_url(blob_url)
            except TRANSCRIPTION_ERRORS as exc:
                self.logger.warning(
                    "transcription_batch_sas_generation_failed",
                    blob_url=blob_url[:120],
                    error=str(exc),
                    error_type=type(exc).__name__,
                )

        payload = {
            "contentUrls": [content_url],
            "locale": self.locale,
            "displayName": f"Transcription_{time.strftime('%Y%m%d_%H%M%S')}",
            "properties": {
                "diarizationEnabled": True,
                "speakers": {"minCount": 1, "maxCount": self.max_speakers},
                "profanityFilterMode": "None",
            },
        }
        headers = self._get_headers(TranscriptionAPI.BATCH)
        response_data = self._request_json(
            "POST",
            f"{self.batch_endpoint}/transcriptions",
            operation="submit batch transcription",
            headers=headers,
            timeout=self.BATCH_SUBMISSION_TIMEOUT,
            expected_statuses=(200, 201, 202),
            json=payload,
        )

        transcription_url = response_data.get("self")
        if not transcription_url:
            raise TranscriptionServiceError(
                "Failed to submit batch transcription: missing job URL in response"
            )
        return transcription_url.rstrip("/").split("/")[-1]

    def check_status(
        self,
        transcription_id: str,
        timeout: int = DEFAULT_STATUS_TIMEOUT,
        interval: int = DEFAULT_POLL_INTERVAL,
    ) -> Dict[str, Any]:
        if transcription_id.startswith("fast_"):
            result = self._fast_results_cache.get(transcription_id)
            if result is None:
                raise TranscriptionServiceError(
                    f"Fast transcription result not found for {transcription_id}"
                )
            return {"status": "Succeeded", "fast_api": True, "result": result}

        headers = self._get_headers(TranscriptionAPI.BATCH)
        status_url = f"{self.batch_endpoint}/transcriptions/{transcription_id}"
        start_time = time.time()
        last_logged_status = None
        last_logged_elapsed = -self.STATUS_LOG_INTERVAL_SECONDS

        while True:
            elapsed = time.time() - start_time
            if elapsed > timeout:
                raise TranscriptionServiceError(
                    f"Timed out waiting for transcription after {elapsed:.1f}s"
                )

            status_data = self._request_json(
                "GET",
                status_url,
                operation="check batch transcription status",
                headers=headers,
                timeout=self.STATUS_REQUEST_TIMEOUT,
                expected_statuses=(200,),
            )
            status = str(status_data.get("status", "")).lower()
            if (
                status != last_logged_status
                or elapsed - last_logged_elapsed >= self.STATUS_LOG_INTERVAL_SECONDS
            ):
                self.logger.info(
                    "transcription_batch_status",
                    transcription_id=transcription_id,
                    status=status or "unknown",
                    elapsed_seconds=int(elapsed),
                )
                last_logged_status = status
                last_logged_elapsed = elapsed

            if status == "succeeded":
                return status_data
            if status == "failed":
                error = status_data.get("error") or status_data.get("properties", {}).get(
                    "error"
                )
                raise TranscriptionServiceError(
                    f"Transcription failed: {json.dumps(error or status_data)[:500]}"
                )

            time.sleep(interval)

    def _select_batch_result_urls(self, files_data: Dict[str, Any]) -> list[str]:
        values = files_data.get("values") or []
        if not values:
            raise TranscriptionServiceError("No transcription files were returned")

        preferred: list[str] = []
        fallback: list[str] = []
        for entry in values:
            content_url = entry.get("links", {}).get("contentUrl")
            if not content_url:
                continue

            kind = str(entry.get("kind") or "").lower()
            name = str(entry.get("name") or "").lower()
            if kind == "transcription" or name == "transcription.json":
                preferred.append(content_url)
            elif "transcription" in name and "report" not in name:
                preferred.append(content_url)
            else:
                fallback.append(content_url)

        urls = preferred or fallback
        if not urls:
            raise TranscriptionServiceError(
                "Transcription files did not contain a downloadable result"
            )
        return urls

    def _require_transcript(self, transcript: str, source: str) -> str:
        normalized = transcript.strip()
        if not normalized:
            raise TranscriptionServiceError(
                f"{source} completed without any recognized text"
            )
        return normalized

    def get_results(self, status_data: Dict[str, Any]) -> str:
        if status_data.get("fast_api"):
            transcript = self._format_fast_transcription(status_data.get("result") or {})
            return self._require_transcript(transcript, "Fast transcription")

        files_url = status_data.get("links", {}).get("files")
        if not files_url:
            raise TranscriptionServiceError("Files URL not found in batch status payload")

        headers = self._get_headers(TranscriptionAPI.BATCH)
        files_data = self._request_json(
            "GET",
            files_url,
            operation="retrieve transcription files",
            headers=headers,
            timeout=self.RESULT_REQUEST_TIMEOUT,
            expected_statuses=(200,),
        )

        errors: list[str] = []
        for result_url in self._select_batch_result_urls(files_data):
            try:
                result_data = self._download_result_json(result_url, headers)
            except TranscriptionServiceError as exc:
                errors.append(str(exc))
                continue

            transcript = self._format_batch_transcription(result_data)
            if transcript.strip():
                return transcript.strip()

            errors.append(f"{result_url} produced no transcript text")

        detail = "; ".join(errors[:3]) if errors else "no result artifacts were usable"
        raise TranscriptionServiceError(
            f"Batch transcription completed without any recognized text: {detail}"
        )

    def _normalize_text_value(self, value: Any) -> str:
        if isinstance(value, str):
            return value.strip()
        return ""

    def _extract_text_from_words(self, payload: Dict[str, Any]) -> str:
        words = payload.get("words")
        if not isinstance(words, list):
            return ""

        word_texts = []
        for word in words:
            if not isinstance(word, dict):
                continue
            text = self._normalize_text_value(word.get("word") or word.get("text"))
            if text:
                word_texts.append(text)
        return " ".join(word_texts)

    def _extract_text(self, payload: Dict[str, Any]) -> str:
        for key in ("display", "text", "lexical", "itn", "maskedITN"):
            text = self._normalize_text_value(payload.get(key))
            if text:
                return text
        return self._extract_text_from_words(payload)

    def _extract_combined_text(self, phrases: Any) -> str:
        if not isinstance(phrases, list):
            return ""

        combined_lines = []
        for phrase in phrases:
            if not isinstance(phrase, dict):
                continue
            text = self._extract_text(phrase)
            if text:
                combined_lines.append(text)
        return "\n".join(combined_lines).strip()

    def _speaker_label(self, speaker: Any) -> Optional[str]:
        if speaker is None:
            return None

        label = str(speaker).strip()
        if not label:
            return None
        if label.lower().startswith("speaker"):
            return label
        return f"Speaker {label}"

    def _render_segments(self, segments: Iterable[TranscriptSegment]) -> str:
        formatted_lines = []
        current_speaker = None

        for segment in segments:
            speaker_label = self._speaker_label(segment.speaker)
            if speaker_label and speaker_label != current_speaker:
                header = f"--- {speaker_label}"
                if segment.timestamp:
                    header += f" @ {segment.timestamp}"
                header += " ---"
                formatted_lines.append(header)
                current_speaker = speaker_label

            line = segment.text
            if segment.timestamp:
                line = f"[{segment.timestamp}] {line}"
            if segment.confidence is not None and segment.confidence < 0.8:
                line = f"{line} [Confidence: {segment.confidence:.2f}]"

            if speaker_label:
                formatted_lines.append(f"  {line}")
            else:
                formatted_lines.append(line)

        return "\n".join(formatted_lines).strip()

    def _format_fast_transcription(self, results: Dict[str, Any]) -> str:
        segments = []
        for phrase in results.get("phrases") or []:
            if not isinstance(phrase, dict):
                continue

            text = self._extract_text(phrase)
            if not text:
                continue

            offset_ms = phrase.get("offsetMilliseconds")
            timestamp = None
            if isinstance(offset_ms, (int, float)):
                timestamp = self._ms_to_timestamp(int(offset_ms))

            confidence = phrase.get("confidence")
            if not isinstance(confidence, (int, float)):
                confidence = None

            segments.append(
                TranscriptSegment(
                    text=text,
                    speaker=phrase.get("speaker"),
                    timestamp=timestamp,
                    confidence=confidence,
                )
            )

        if segments:
            return self._render_segments(segments)

        for key in ("combinedPhrases", "combinedRecognizedPhrases"):
            transcript = self._extract_combined_text(results.get(key))
            if transcript:
                return transcript

        return ""

    def _format_batch_transcription(self, results: Dict[str, Any]) -> str:
        segments = []
        for phrase in results.get("recognizedPhrases") or []:
            if not isinstance(phrase, dict):
                continue

            nbest = phrase.get("nBest") or []
            best = nbest[0] if nbest and isinstance(nbest[0], dict) else phrase
            text = self._extract_text(best)
            if not text:
                continue

            confidence = best.get("confidence")
            if not isinstance(confidence, (int, float)):
                confidence = None

            segments.append(
                TranscriptSegment(
                    text=text,
                    speaker=phrase.get("speaker"),
                    timestamp=self._extract_phrase_timestamp(phrase),
                    confidence=confidence,
                )
            )

        if segments:
            return self._render_segments(segments)

        return self._extract_combined_text(results.get("combinedRecognizedPhrases"))

    def _extract_phrase_timestamp(self, phrase: Dict[str, Any]) -> Optional[str]:
        for key in ("offset", "startOffset", "startTime", "offsetInTicks"):
            if key not in phrase or phrase[key] is None:
                continue

            timestamp = self._coerce_timestamp(phrase[key], key)
            if timestamp:
                return timestamp

        nbest = phrase.get("nBest") or []
        best = nbest[0] if nbest and isinstance(nbest[0], dict) else {}
        words = best.get("words") or phrase.get("words") or []
        if not isinstance(words, list) or not words:
            return None

        first_word = words[0]
        if not isinstance(first_word, dict):
            return None

        for key in ("offset", "startOffset", "startTime", "offsetInTicks"):
            if key not in first_word or first_word[key] is None:
                continue

            timestamp = self._coerce_timestamp(first_word[key], key)
            if timestamp:
                return timestamp

        return None

    def _coerce_timestamp(self, value: Any, key: str = "") -> Optional[str]:
        if isinstance(value, str):
            iso_seconds = self._parse_iso_duration(value)
            if iso_seconds is not None:
                return self._secs_to_timestamp(iso_seconds)
            try:
                numeric_value = float(value)
            except ValueError:
                return None
            return self._numeric_timestamp_to_string(numeric_value, key)

        if isinstance(value, (int, float)):
            return self._numeric_timestamp_to_string(float(value), key)

        return None

    def _numeric_timestamp_to_string(self, value: float, key: str) -> str:
        lowered_key = key.lower()
        if "tick" in lowered_key:
            return self._ticks_to_timestamp(int(value))
        if lowered_key in {"offset", "startoffset"} and value >= 1_000_000_000:
            return self._secs_to_timestamp(value / 1_000_000_000)
        if value >= 100_000_000:
            return self._ticks_to_timestamp(int(value))
        if "millisecond" in lowered_key or value >= 1000:
            return self._ms_to_timestamp(int(value))
        return self._secs_to_timestamp(value)

    def _parse_iso_duration(self, duration_str: str) -> Optional[float]:
        match = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(\d+(?:\.\d+)?)S$", duration_str)
        if not match:
            return None

        hours = float(match.group(1)) if match.group(1) else 0.0
        minutes = float(match.group(2)) if match.group(2) else 0.0
        seconds = float(match.group(3))
        return hours * 3600 + minutes * 60 + seconds

    def _secs_to_timestamp(self, secs: float) -> str:
        try:
            td = timedelta(seconds=secs)
            total_seconds = int(td.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            milliseconds = int((td.total_seconds() - total_seconds) * 1000)
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"
        except TIMESTAMP_PARSE_ERRORS:
            return "00:00:00.000"

    def _ms_to_timestamp(self, ms: int) -> str:
        try:
            return self._secs_to_timestamp(ms / 1000.0)
        except TIMESTAMP_PARSE_ERRORS:
            return "00:00:00.000"

    def _ticks_to_timestamp(self, ticks: int) -> str:
        try:
            return self._secs_to_timestamp(ticks / 10_000_000)
        except TIMESTAMP_PARSE_ERRORS:
            return "00:00:00.000"
