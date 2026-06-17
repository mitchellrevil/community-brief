"""Focused tests for the live hybrid transcription service."""

from unittest.mock import Mock

import pytest

from config import AppConfig
from services.fast_transcription_service import (
    FastTranscriptionService,
    TranscriptionAPI,
    TranscriptionServiceError,
)


def _mock_response(status_code: int, payload: dict, text: str = "") -> Mock:
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    response.text = text or ""
    response.reason = text or ""
    return response


@pytest.fixture
def mock_config() -> Mock:
    config = Mock(spec=AppConfig)
    config.speech_endpoint = None
    config.speech_deployment = "uksouth"
    config.speech_max_speakers = 10
    config.speech_transcription_locale = "en-GB"
    config.enable_fast_transcription = True
    config.fast_transcription_duration_threshold_minutes = 120
    return config


@pytest.fixture
def mock_credential() -> Mock:
    credential = Mock()
    token = Mock()
    token.token = "test_token_12345"
    token.expires_on = 9999999999
    credential.get_token.return_value = token
    return credential


@pytest.fixture
def service(mock_config: Mock, mock_credential: Mock) -> FastTranscriptionService:
    return FastTranscriptionService(config=mock_config, credential=mock_credential)


@pytest.fixture
def service_fast_disabled(mock_config: Mock, mock_credential: Mock) -> FastTranscriptionService:
    mock_config.enable_fast_transcription = False
    return FastTranscriptionService(config=mock_config, credential=mock_credential)


class TestRouting:
    def test_routes_to_batch_when_fast_disabled(self, service_fast_disabled: FastTranscriptionService):
        api_type, reason = service_fast_disabled.determine_api(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

        assert api_type == TranscriptionAPI.BATCH
        assert "disabled" in reason.lower()

    def test_routes_to_batch_when_size_unknown(self, service: FastTranscriptionService):
        service._get_blob_file_size = Mock(return_value=None)

        api_type, reason = service.determine_api(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

        assert api_type == TranscriptionAPI.BATCH
        assert "size unavailable" in reason.lower()

    def test_routes_to_batch_when_duration_missing(self, service: FastTranscriptionService):
        api_type, reason = service.determine_api(
            "https://test.blob.core.windows.net/recordings/audio.wav",
            file_size_bytes=10 * 1024 * 1024,
        )

        assert api_type == TranscriptionAPI.BATCH
        assert "duration unavailable" in reason.lower()

    def test_routes_to_fast_when_size_and_duration_are_known_safe(self, service: FastTranscriptionService):
        api_type, reason = service.determine_api(
            "https://test.blob.core.windows.net/recordings/audio.wav",
            file_size_bytes=10 * 1024 * 1024,
            audio_duration_minutes=15,
        )

        assert api_type == TranscriptionAPI.FAST
        assert "eligible" in reason.lower()


class TestSubmissionAndStatus:
    def test_submit_fast_transcription_success(self, service: FastTranscriptionService):
        service._download_audio_from_blob = Mock(return_value=b"fake-audio")
        service.session.request = Mock(
            return_value=_mock_response(
                200,
                {
                    "phrases": [
                        {
                            "text": "Hello world",
                            "speaker": 1,
                            "offsetMilliseconds": 0,
                            "confidence": 0.95,
                        }
                    ]
                },
            )
        )

        transcription_id = service._submit_fast_transcription(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

        assert transcription_id.startswith("fast_")
        request_call = service.session.request.call_args
        assert request_call.kwargs["method"] == "POST"
        assert "api-version=2025-10-15" in request_call.kwargs["url"]

    def test_submit_batch_transcription_success(self, service: FastTranscriptionService):
        service.session.request = Mock(
            return_value=_mock_response(
                201,
                {
                    "self": "https://uksouth.cognitiveservices.azure.com/speechtotext/v3.2/transcriptions/abc123"
                },
            )
        )

        transcription_id = service._submit_batch_transcription(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

        assert transcription_id == "abc123"
        payload = service.session.request.call_args.kwargs["json"]
        assert payload["locale"] == "en-GB"
        assert payload["properties"]["diarizationEnabled"] is True

    def test_submit_batch_transcription_uses_storage_sas_url(
        self,
        mock_config: Mock,
        mock_credential: Mock,
    ):
        storage_service = Mock()
        storage_service.generate_sas_url.return_value = (
            "https://test.blob.core.windows.net/recordings/audio.wav?sig=signed"
        )
        service = FastTranscriptionService(
            config=mock_config,
            credential=mock_credential,
            storage_service=storage_service,
        )
        service.session.request = Mock(
            return_value=_mock_response(
                201,
                {
                    "self": "https://uksouth.cognitiveservices.azure.com/speechtotext/v3.2/transcriptions/abc123"
                },
            )
        )

        service._submit_batch_transcription(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

        payload = service.session.request.call_args.kwargs["json"]
        assert payload["contentUrls"] == [
            "https://test.blob.core.windows.net/recordings/audio.wav?sig=signed"
        ]
        storage_service.generate_sas_url.assert_called_once_with(
            "https://test.blob.core.windows.net/recordings/audio.wav"
        )

    def test_check_status_returns_cached_fast_result(self, service: FastTranscriptionService):
        cached_result = {"phrases": [{"text": "Test", "speaker": 1}]}
        service._cache_fast_result("fast_12345", cached_result)

        status_data = service.check_status("fast_12345")

        assert status_data["status"] == "Succeeded"
        assert status_data["result"] == cached_result

    def test_check_status_raises_for_failed_batch_job(self, service: FastTranscriptionService):
        service.session.request = Mock(
            return_value=_mock_response(
                200,
                {"status": "Failed", "error": {"message": "Audio format not supported"}},
            )
        )

        with pytest.raises(TranscriptionServiceError, match="Transcription failed"):
            service.check_status("batch_12345", timeout=1, interval=0)


class TestResults:
    def test_get_results_prefers_transcription_artifact(self, service: FastTranscriptionService):
        files_response = _mock_response(
            200,
            {
                "values": [
                    {
                        "kind": "TranscriptionReport",
                        "name": "report.json",
                        "links": {"contentUrl": "https://example.com/report.json"},
                    },
                    {
                        "kind": "Transcription",
                        "name": "transcription.json",
                        "links": {"contentUrl": "https://example.com/transcription.json"},
                    },
                ]
            },
        )
        transcript_response = _mock_response(
            200,
            {
                "combinedRecognizedPhrases": [
                    {"display": "Hello, this is the transcript."}
                ]
            },
        )
        service.session.request = Mock(side_effect=[files_response, transcript_response])

        result = service.get_results({"links": {"files": "https://example.com/files"}})

        assert result == "Hello, this is the transcript."
        requested_urls = [call.kwargs["url"] for call in service.session.request.call_args_list]
        assert "https://example.com/report.json" not in requested_urls
        assert "https://example.com/transcription.json" in requested_urls

    def test_format_batch_transcription_falls_back_to_combined_text(self, service: FastTranscriptionService):
        result = service._format_batch_transcription(
            {
                "recognizedPhrases": [{"nBest": [{"confidence": 0.92}]}],
                "combinedRecognizedPhrases": [
                    {"display": "Fallback transcript text"}
                ],
            }
        )

        assert result == "Fallback transcript text"

    def test_format_fast_transcription_falls_back_to_combined_text(self, service: FastTranscriptionService):
        result = service._format_fast_transcription(
            {
                "phrases": [{"speaker": 1, "confidence": 0.95}],
                "combinedPhrases": [{"text": "Fallback fast transcript"}],
            }
        )

        assert result == "Fallback fast transcript"

    def test_get_results_raises_when_batch_transcript_is_empty(self, service: FastTranscriptionService):
        files_response = _mock_response(
            200,
            {
                "values": [
                    {
                        "kind": "Transcription",
                        "name": "transcription.json",
                        "links": {"contentUrl": "https://example.com/transcription.json"},
                    }
                ]
            },
        )
        empty_transcript_response = _mock_response(
            200,
            {"recognizedPhrases": [], "combinedRecognizedPhrases": []},
        )
        service.session.request = Mock(
            side_effect=[files_response, empty_transcript_response]
        )

        with pytest.raises(TranscriptionServiceError, match="without any recognized text"):
            service.get_results({"links": {"files": "https://example.com/files"}})


class TestFallbackBehavior:
    def test_submit_transcription_job_falls_back_to_batch_on_fast_limit_error(
        self,
        service: FastTranscriptionService,
    ):
        service._submit_fast_transcription = Mock(
            side_effect=TranscriptionServiceError("Audio duration too long")
        )
        service._submit_batch_transcription = Mock(return_value="batch789")

        transcription_id = service.submit_transcription_job(
            "https://test.blob.core.windows.net/recordings/audio.wav",
            file_size_bytes=10 * 1024 * 1024,
            audio_duration_minutes=10,
        )

        assert transcription_id == "batch789"


class TestHelpers:
    def test_audio_download_failure(self, service: FastTranscriptionService):
        service._parse_blob_url = Mock(side_effect=RuntimeError("boom"))

        with pytest.raises(TranscriptionServiceError, match="Failed to download audio"):
            service._download_audio_from_blob(
                "https://test.blob.core.windows.net/recordings/audio.wav"
            )

    def test_timestamp_conversion_ticks(self, service: FastTranscriptionService):
        assert service._ticks_to_timestamp(50_000_000) == "00:00:05.000"

    def test_batch_timestamp_treats_large_numeric_offset_as_ticks(
        self,
        service: FastTranscriptionService,
    ):
        formatted = service._format_batch_transcription(
            {
                "recognizedPhrases": [
                    {
                        "speaker": "Speaker 1",
                        "offset": 3_000_000_000,
                        "nBest": [{"display": "Hello world", "confidence": 0.95}],
                    }
                ]
            }
        )

        assert "[00:00:03.000] Hello world" in formatted
