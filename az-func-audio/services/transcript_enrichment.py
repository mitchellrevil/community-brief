"""Optional transcript enrichment shared by initial processing and reprocessing."""

from dataclasses import dataclass
from typing import Any

from core.logging import get_logger
from services.speaker_identification_service import SpeakerIdentificationService

logger = get_logger(__name__)


@dataclass(frozen=True)
class EnrichedTranscript:
    text: str
    speaker_identification: dict[str, Any] | None = None


def enrich_transcript(
    transcript: str,
    *,
    prompt_metadata: dict[str, Any],
    session_data: Any,
    analysis_service: Any,
    model: str,
    job_id: str,
    correlation_id: str,
    log_prefix: str = "blob",
) -> EnrichedTranscript:
    if not prompt_metadata.get("speaker_identification_enabled", False):
        return EnrichedTranscript(transcript)
    logger.info(
        f"{log_prefix}.speaker_identification.started",
        job_id=job_id,
        correlation_id=correlation_id,
        model=model,
        transcript_chars=len(transcript),
        has_session_data=bool(session_data),
    )
    try:
        service = SpeakerIdentificationService(analysis_service=analysis_service, model=model)
        text, metadata = service.identify(transcript, session_data=session_data)
        logger.info(
            f"{log_prefix}.speaker_identification.applied" if text != transcript else f"{log_prefix}.speaker_identification.no_changes",
            job_id=job_id,
            correlation_id=correlation_id,
            applied=metadata.get("applied", False),
            reason=metadata.get("reason"),
            labels=list((metadata.get("labels") or {}).keys()),
        )
        return EnrichedTranscript(text, metadata)
    except Exception as exc:
        # Enrichment cannot prevent transcription or analysis from completing.
        logger.warning(
            f"{log_prefix}.speaker_identification.failed",
            job_id=job_id,
            correlation_id=correlation_id,
            error_type=type(exc).__name__,
        )
        return EnrichedTranscript(
            transcript,
            {"applied": False, "reason": "enrichment_failed", "model": model},
        )
