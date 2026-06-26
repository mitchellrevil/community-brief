from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable, Dict, Optional

from config import AppConfig
from core.job_status import JobStatus
from core.logging import get_logger, redact
from services.analysis_workflow import (
    build_ai_context,
    build_analysis_kwargs,
    get_prompt_inference_settings,
    safe_get_prompt_text,
)
from services.artifact_naming import build_analysis_blob_name

REPROCESS_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)


@dataclass(frozen=True)
class ReprocessResponse:
    payload: Dict[str, Any]
    status_code: int


class ReprocessService:
    def __init__(
        self,
        *,
        config_factory: Callable[[], AppConfig] = AppConfig,
        storage_service_factory: Callable[[], Any],
        analysis_service_factory: Callable[[], Any],
    ) -> None:
        self.config_factory = config_factory
        self.storage_service_factory = storage_service_factory
        self.analysis_service_factory = analysis_service_factory
        self.logger = get_logger(__name__)

    def reprocess(self, payload: Dict[str, Any], *, correlation_id: str) -> ReprocessResponse:
        job_id = payload.get("job_id")
        if not job_id:
            return self._error("job_id is required", status_code=400)

        instructions = self._normalize_instructions(payload.get("instructions"))
        prompt_category_id = payload.get("prompt_category_id")
        prompt_subcategory_id = payload.get("prompt_subcategory_id")
        create_new_job = bool(payload.get("create_new_job"))
        user_id = payload.get("user_id")
        user_email = payload.get("user_email")
        displayname = payload.get("displayname")
        cosmos_service = None
        job: Optional[Dict[str, Any]] = None

        self.logger.info(
            "reprocess.request_received",
            correlation_id=correlation_id,
            job_id=job_id,
            prompt_subcategory_id=prompt_subcategory_id,
            create_new_job=create_new_job,
        )

        try:
            from services.cosmos_service import CosmosService

            config = self.config_factory()
            cosmos_service = CosmosService(config)
            storage_service = self.storage_service_factory()
            analysis_service = self.analysis_service_factory()

            job = cosmos_service.get_job_by_id(job_id)
            if not job:
                return self._error(f"Job {job_id} not found", status_code=404)

            original_subcategory = job.get("prompt_subcategory_id")
            original_category = job.get("prompt_category_id")
            target_subcategory = prompt_subcategory_id or original_subcategory
            if not target_subcategory:
                return self._error("prompt_subcategory_id is required", status_code=400)

            target_category = prompt_category_id or original_category
            transcription_text = self._get_transcription_text(
                job,
                storage_service,
                correlation_id=correlation_id,
                job_id=job_id,
            )
            if not transcription_text:
                return self._error("Recording lacks transcription for reprocessing", status_code=400)

            self.logger.info(
                "reprocess.transcription_retrieved",
                correlation_id=correlation_id,
                job_id=job_id,
                text_length=len(transcription_text),
                has_instructions=bool(instructions),
            )

            original_prompt_text = safe_get_prompt_text(
                cosmos_service,
                original_subcategory,
                correlation_id=correlation_id,
                job_id=job_id,
                logger=self.logger,
            )
            target_prompt_text = safe_get_prompt_text(
                cosmos_service,
                target_subcategory,
                correlation_id=correlation_id,
                job_id=job_id,
                logger=self.logger,
            )
            resolved_prompt_text = self._resolve_prompt_text(original_prompt_text, target_prompt_text)
            if not resolved_prompt_text:
                return self._error("Failed to resolve prompt text for reprocessing", status_code=500)

            self.logger.info(
                "reprocess.prompts_resolved",
                correlation_id=correlation_id,
                job_id=job_id,
                target_subcategory=target_subcategory,
                using_original_prompt=(
                    target_prompt_text == original_prompt_text
                    if target_prompt_text and original_prompt_text
                    else None
                ),
            )

            prompt_metadata, prompt_settings = get_prompt_inference_settings(
                cosmos_service,
                target_subcategory,
                correlation_id=correlation_id,
                job_id=job_id,
                logger=self.logger,
                log_prefix="reprocess.",
            )
            analysis_provider = prompt_settings["analysis_provider"]
            analysis_started_at = datetime.now(UTC).isoformat()

            self._mark_analysis_started(
                cosmos_service,
                job_id,
                analysis_started_at,
                correlation_id=correlation_id,
            )

            analysis_kwargs = build_analysis_kwargs(
                conversation=transcription_text,
                context=build_ai_context(
                    user_prompt=resolved_prompt_text,
                    base_prompt=original_prompt_text,
                    instructions=instructions,
                    session_data=job.get("pre_session_form_data"),
                ),
                prompt_metadata=prompt_metadata,
                settings=prompt_settings,
            )
            analysis_result = analysis_service.analyze_conversation(**analysis_kwargs)
            analysis_text = analysis_result.get("analysis_text")
            if not analysis_text:
                self._mark_analysis_failed(cosmos_service, job_id, correlation_id=correlation_id)
                raise ValueError("Analysis service returned no text")

            blob_name = build_analysis_blob_name(job.get("file_path", job_id))
            analysis_blob_url = storage_service.upload_text(
                config.storage_recordings_container,
                blob_name,
                analysis_text,
            )
            target_job, new_job_created = self._build_target_job(
                job,
                create_new_job=create_new_job,
                target_category=target_category,
                target_subcategory=target_subcategory,
                user_id=user_id,
                user_email=user_email,
                displayname=displayname,
            )
            existing_attempts = self._append_analysis_attempt(
                target_job,
                analysis_blob_url=analysis_blob_url,
                instructions=instructions,
                target_category=target_category,
                target_subcategory=target_subcategory,
                original_category=original_category,
                original_subcategory=original_subcategory,
                analysis_provider=analysis_provider,
            )

            target_job.update(
                {
                    "analysis_file_path": analysis_blob_url,
                    "analysis_attempts": existing_attempts,
                    "analysis_latest_attempt": existing_attempts[-1].get("attempt") if existing_attempts else None,
                    "analysis_started_at": analysis_started_at,
                    "analysis_completed_at": datetime.now(UTC).isoformat(),
                    "analysis_in_progress": False,
                    "analysis_instructions": instructions,
                    "analysis_provider": analysis_provider,
                    "status": JobStatus.COMPLETED,
                    "prompt_category_id": target_category,
                    "prompt_subcategory_id": target_subcategory,
                    "updated_at": datetime.now(UTC).isoformat(),
                }
            )
            cosmos_service.upsert_job(target_job)

            if create_new_job:
                self._mark_original_job_completed(
                    cosmos_service,
                    job_id,
                    target_job["id"],
                    correlation_id=correlation_id,
                )

            attempt_number = existing_attempts[-1].get("attempt") if existing_attempts else None
            self.logger.info(
                "reprocess.completed",
                correlation_id=correlation_id,
                job_id=target_job["id"],
                attempt_number=attempt_number,
                analysis_blob_url=redact(analysis_blob_url, keep=60),
                new_job_created=new_job_created,
                analysis_provider=analysis_provider or "config default",
            )
            return ReprocessResponse(
                {
                    "status": "success",
                    "message": "Analysis reprocessed",
                    "job_id": target_job["id"],
                    "new_job_created": new_job_created,
                    "analysis_file_path": analysis_blob_url,
                    "attempt_number": attempt_number,
                    "correlation_id": correlation_id,
                },
                200,
            )
        except REPROCESS_ERRORS as exc:
            self._handle_reprocess_exception(
                exc,
                cosmos_service=cosmos_service,
                job=job,
                job_id=job_id,
                correlation_id=correlation_id,
            )
            return self._error(str(exc), status_code=500)

    def _get_transcription_text(
        self,
        job: Dict[str, Any],
        storage_service,
        *,
        correlation_id: str,
        job_id: str,
    ) -> Optional[str]:
        transcription_text = job.get("text_content")
        if transcription_text or not job.get("transcription_file_path"):
            return transcription_text

        try:
            return storage_service.download_text_from_blob(job["transcription_file_path"])
        except REPROCESS_ERRORS:
            self.logger.exception(
                "reprocess.transcription_download_failed",
                correlation_id=correlation_id,
                job_id=job_id,
            )
            raise RuntimeError("Failed to download transcription file")

    @staticmethod
    def _normalize_instructions(instructions_raw: Any) -> Optional[str]:
        if isinstance(instructions_raw, str) and instructions_raw.strip():
            return instructions_raw.strip()
        return None

    @staticmethod
    def _resolve_prompt_text(
        original_prompt_text: Optional[str],
        target_prompt_text: Optional[str],
    ) -> Optional[str]:
        resolved_prompt_text = target_prompt_text or original_prompt_text
        if target_prompt_text and original_prompt_text and target_prompt_text.strip() == original_prompt_text.strip():
            return original_prompt_text
        return resolved_prompt_text

    def _mark_analysis_started(
        self,
        cosmos_service,
        job_id: str,
        analysis_started_at: str,
        *,
        correlation_id: str,
    ) -> None:
        try:
            cosmos_service.update_job_status(
                job_id,
                JobStatus.ANALYSING,
                analysis_started_at=analysis_started_at,
                analysis_in_progress=True,
            )
        except REPROCESS_ERRORS:
            self.logger.warning(
                "reprocess.mark_analysis_started_failed",
                correlation_id=correlation_id,
                job_id=job_id,
                exc_info=True,
            )

    def _mark_analysis_failed(self, cosmos_service, job_id: str, *, correlation_id: str) -> None:
        try:
            cosmos_service.update_job_status(job_id, JobStatus.FAILED, analysis_in_progress=False)
        except REPROCESS_ERRORS:
            self.logger.warning(
                "reprocess.clear_in_progress_failed",
                correlation_id=correlation_id,
                job_id=job_id,
                exc_info=True,
            )

    @staticmethod
    def _build_target_job(
        job: Dict[str, Any],
        *,
        create_new_job: bool,
        target_category: Optional[str],
        target_subcategory: str,
        user_id: Optional[str],
        user_email: Optional[str],
        displayname: Optional[str],
    ) -> tuple[Dict[str, Any], bool]:
        if not create_new_job:
            return job, False

        return (
            {
                "id": str(uuid.uuid4()),
                "type": "job",
                "created_at": datetime.now(UTC).isoformat(),
                "user_id": user_id or job.get("user_id"),
                "user_email": user_email or job.get("user_email"),
                "file_name": job.get("file_name"),
                "file_path": job.get("file_path"),
                "displayname": displayname or job.get("displayname") or job.get("file_name"),
                "status": JobStatus.COMPLETED,
                "transcription_file_path": job.get("transcription_file_path"),
                "analysis_file_path": None,
                "analysis_attempts": [],
                "prompt_category_id": target_category,
                "prompt_subcategory_id": target_subcategory,
                "created_by_reprocess_job": job.get("id"),
            },
            True,
        )

    @staticmethod
    def _append_analysis_attempt(
        target_job: Dict[str, Any],
        *,
        analysis_blob_url: str,
        instructions: Optional[str],
        target_category: Optional[str],
        target_subcategory: str,
        original_category: Optional[str],
        original_subcategory: Optional[str],
        analysis_provider: Optional[str],
    ) -> list[Dict[str, Any]]:
        existing_attempts = target_job.get("analysis_attempts")
        if not isinstance(existing_attempts, list):
            existing_attempts = []

        previous_path = target_job.get("analysis_file_path")
        if previous_path and not any(
            attempt.get("analysis_file_path") == previous_path
            for attempt in existing_attempts
            if isinstance(attempt, dict)
        ):
            existing_attempts.append(
                {
                    "attempt": len(existing_attempts) + 1,
                    "analysis_file_path": previous_path,
                    "created_at": (
                        target_job.get("analysis_completed_at")
                        or target_job.get("updated_at")
                        or target_job.get("created_at")
                    ),
                }
            )

        if not any(
            attempt.get("analysis_file_path") == analysis_blob_url
            for attempt in existing_attempts
            if isinstance(attempt, dict)
        ):
            existing_attempts.append(
                {
                    "attempt": len(existing_attempts) + 1,
                    "analysis_file_path": analysis_blob_url,
                    "created_at": datetime.now(UTC).isoformat(),
                    "analysis_instructions": instructions,
                    "prompt_category_id": target_category,
                    "prompt_subcategory_id": target_subcategory,
                    "original_prompt_category_id": original_category,
                    "original_prompt_subcategory_id": original_subcategory,
                    "created_by": "reprocess",
                    "analysis_provider": analysis_provider,
                }
            )

        return existing_attempts

    def _mark_original_job_completed(
        self,
        cosmos_service,
        job_id: str,
        new_job_id: str,
        *,
        correlation_id: str,
    ) -> None:
        try:
            cosmos_service.update_job_status(
                job_id,
                JobStatus.COMPLETED,
                analysis_in_progress=False,
                updated_at=datetime.now(UTC).isoformat(),
            )
            self.logger.info(
                "reprocess.original_job_completed",
                correlation_id=correlation_id,
                original_job_id=job_id,
                new_job_id=new_job_id,
            )
        except REPROCESS_ERRORS as status_exc:
            self.logger.warning(
                "reprocess.original_job_completion_failed",
                correlation_id=correlation_id,
                job_id=job_id,
                error=str(status_exc),
                error_type=type(status_exc).__name__,
                exc_info=True,
            )

    def _handle_reprocess_exception(
        self,
        exc: Exception,
        *,
        cosmos_service,
        job: Optional[Dict[str, Any]],
        job_id: Optional[str],
        correlation_id: str,
    ) -> None:
        job_status = job.get("status", JobStatus.ERROR) if isinstance(job, dict) else JobStatus.ERROR
        self._clear_analysis_in_progress_after_failure(
            cosmos_service,
            job_id=job_id,
            status=job_status,
            error_message=str(exc),
            correlation_id=correlation_id,
        )
        self.logger.exception(
            "reprocess.failed",
            correlation_id=correlation_id,
            job_id=job_id,
            error=str(exc),
            error_type=type(exc).__name__,
        )

    def _clear_analysis_in_progress_after_failure(
        self,
        cosmos_service,
        *,
        job_id: Optional[str],
        status: str,
        error_message: str,
        correlation_id: str,
    ) -> None:
        if not job_id or not cosmos_service:
            return

        try:
            cosmos_service.update_job_status(
                job_id,
                status,
                analysis_in_progress=False,
                error_message=error_message,
            )
        except REPROCESS_ERRORS as status_exc:
            self.logger.warning(
                "reprocess.failure_status_update_failed",
                correlation_id=correlation_id,
                job_id=job_id,
                error=str(status_exc),
                error_type=type(status_exc).__name__,
                exc_info=True,
            )

    @staticmethod
    def _error(message: str, *, status_code: int) -> ReprocessResponse:
        return ReprocessResponse({"status": "error", "message": message}, status_code)
