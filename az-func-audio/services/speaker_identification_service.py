from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from core.logging import get_logger

SPEAKER_HEADER_RE = re.compile(
    r"^(?P<prefix>---\s*Speaker\s+)(?P<speaker_id>\w+)"
    r"(?::\s*(?P<label>[^@\r\n]*?))?\s*@\s*(?P<timestamp>[\d:.\s]+)\s*---(?P<ending>\s*)$"
)
NAME_CONFIDENCE_THRESHOLD = 0.6
MAX_LABEL_LENGTH = 100
MAX_TRANSCRIPT_CHARS = 12000

SPEAKER_IDENTIFICATION_INSTRUCTIONS = (
    "Identify likely speaker labels for a diarised transcript. "
    "Use pre-session form inputs as candidate labels. For one-to-one meetings, "
    "fields like 'Name of Manager' and 'Name of Staff' are intended speaker labels: "
    "map the manager to the speaker leading the meeting, asking wellbeing/review "
    "questions, or setting the agenda, and map the staff member to the speaker "
    "answering those questions. "
    "When the name is uncertain, provide a role if it is clear, such as Chair, "
    "Social worker, Parent, Officer, or Resident. Do not invent names or roles."
)

SPEAKER_IDENTIFICATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "speakers": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "speaker_id": {
                        "type": "string",
                        "description": "The diarisation speaker id from the transcript, such as 1 or 2.",
                    },
                    "name": {
                        "type": "string",
                        "description": "Full speaker name when clear, otherwise an empty string.",
                    },
                    "role": {
                        "type": "string",
                        "description": "Speaker role when clear, otherwise an empty string.",
                    },
                    "confidence": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 1,
                        "description": "Confidence that the name matches this speaker.",
                    },
                    "evidence": {
                        "type": "string",
                        "description": "Brief transcript or pre-session evidence for the label.",
                    },
                },
                "required": ["speaker_id", "name", "role", "confidence", "evidence"],
            },
        }
    },
    "required": ["speakers"],
}

logger = get_logger(__name__)


class SpeakerIdentificationService:
    def __init__(self, *, analysis_service: Any, model: str = "gpt-5.6-luna") -> None:
        self.analysis_service = analysis_service
        self.model = model

    def identify(self, transcript: str, session_data: Any = None) -> tuple[str, Dict[str, Any]]:
        speaker_ids = extract_speaker_ids(transcript)
        if not speaker_ids:
            logger.info(
                "speaker_identification.skipped",
                reason="no_speaker_headers",
                transcript_chars=len(transcript),
            )
            return transcript, {"applied": False, "reason": "no_speaker_headers"}

        response_text = self._call_model(
            transcript_excerpt=build_transcript_excerpt(transcript),
            speaker_ids=speaker_ids,
            session_data=session_data,
        )
        speaker_map = parse_speaker_map(response_text)
        labels = labels_from_speaker_map(speaker_map, speaker_ids=speaker_ids)
        if not labels:
            logger.info(
                "speaker_identification.no_reliable_labels",
                model=self.model,
                speaker_count=len(speaker_ids),
                response_chars=len(response_text),
            )
            return transcript, {"applied": False, "reason": "no_reliable_labels"}

        rewritten = rewrite_transcription_speaker_labels(transcript, labels)
        logger.info(
            "speaker_identification.labels_selected",
            model=self.model,
            speaker_count=len(speaker_ids),
            label_count=len(labels),
        )
        return rewritten, {
            "applied": rewritten != transcript,
            "model": self.model,
            "labels": labels,
        }

    def _call_model(
        self,
        *,
        transcript_excerpt: str,
        speaker_ids: list[str],
        session_data: Any,
    ) -> str:
        provider = self.analysis_service._get_provider("responses")
        payload = {
            "speaker_ids": speaker_ids,
            "pre_session_form_inputs": session_data or {},
            "transcript_excerpt": transcript_excerpt,
            "task": (
                "Return one object per speaker_id. Prefer supplied form names when "
                "the transcript supports the matching role. Leave name and role empty "
                "only when neither the form context nor transcript role evidence is enough."
            ),
        }
        payload_json = json.dumps(payload, ensure_ascii=False)
        logger.info(
            "speaker_identification.prompt_submitted",
            model=self.model,
            speaker_count=len(speaker_ids),
            speaker_ids=speaker_ids,
            has_session_data=bool(session_data),
            prompt_chars=len(payload_json),
            transcript_excerpt_chars=len(transcript_excerpt),
        )
        response = provider.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": SPEAKER_IDENTIFICATION_INSTRUCTIONS},
                {"role": "user", "content": payload_json},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "speaker_identification",
                    "schema": SPEAKER_IDENTIFICATION_SCHEMA,
                    "strict": True,
                }
            },
            reasoning={"effort": "low"},
            max_output_tokens=16000,
            timeout=120,
        )
        response_text = extract_response_text(response)
        logger.info(
            "speaker_identification.response_received",
            model=self.model,
            response_chars=len(response_text),
            response_id=getattr(response, "id", None),
            response_status=getattr(response, "status", None),
        )
        return response_text


def extract_speaker_ids(transcript: str) -> list[str]:
    seen: set[str] = set()
    speaker_ids: list[str] = []
    for line in transcript.splitlines():
        match = SPEAKER_HEADER_RE.match(line)
        if not match:
            continue
        speaker_id = match.group("speaker_id")
        if speaker_id not in seen:
            seen.add(speaker_id)
            speaker_ids.append(speaker_id)
    return speaker_ids


def build_transcript_excerpt(transcript: str) -> str:
    if len(transcript) <= MAX_TRANSCRIPT_CHARS:
        return transcript
    return transcript[:MAX_TRANSCRIPT_CHARS]


def parse_speaker_map(response_text: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            parsed = json.loads(response_text[start : end + 1])
        except json.JSONDecodeError:
            return {}

    if not isinstance(parsed, dict):
        return {}
    speakers = parsed.get("speakers", parsed)
    if isinstance(speakers, list):
        mapped: Dict[str, Any] = {}
        for speaker in speakers:
            if not isinstance(speaker, dict):
                continue
            speaker_id = speaker.get("speaker_id")
            if speaker_id is not None:
                mapped[str(speaker_id).strip()] = speaker
        return mapped
    return speakers if isinstance(speakers, dict) else {}


def extract_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text:
        return output_text

    parts: list[str] = []
    for item in getattr(response, "output", None) or []:
        for content in getattr(item, "content", None) or []:
            text = getattr(content, "text", None)
            if isinstance(text, str) and text:
                parts.append(text)
    return "".join(parts)


def labels_from_speaker_map(
    speaker_map: Dict[str, Any],
    *,
    speaker_ids: Optional[list[str]] = None,
) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    for speaker_id, raw_value in speaker_map.items():
        if not isinstance(raw_value, dict):
            continue
        confidence = _parse_confidence(raw_value.get("confidence"))
        name = _clean_label(raw_value.get("name"))
        role = _clean_label(raw_value.get("role"))
        label = name if name and confidence >= NAME_CONFIDENCE_THRESHOLD else role
        if label:
            labels[str(speaker_id).strip()] = label

    for speaker_id in speaker_ids or []:
        normalized_id = str(speaker_id).strip()
        if normalized_id and normalized_id not in labels:
            labels[normalized_id] = f"Participant {normalized_id}"
    return labels


def rewrite_transcription_speaker_labels(transcript: str, labels: Dict[str, str]) -> str:
    def rewrite_line(line: str) -> str:
        newline = ""
        if line.endswith("\r\n"):
            line, newline = line[:-2], "\r\n"
        elif line.endswith("\n"):
            line, newline = line[:-1], "\n"

        match = SPEAKER_HEADER_RE.match(line)
        if not match:
            return f"{line}{newline}"

        speaker_id = match.group("speaker_id")
        label = labels.get(speaker_id)
        if not label:
            return f"{line}{newline}"
        return f"--- Speaker {speaker_id}: {label} @ {match.group('timestamp').strip()} ---{newline}"

    return "".join(rewrite_line(line) for line in transcript.splitlines(keepends=True))


def _parse_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(confidence, 1.0))


def _clean_label(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    label = " ".join(value.strip().split())
    if not label or "@" in label or "\n" in label or "\r" in label:
        return None
    return label[:MAX_LABEL_LENGTH]
