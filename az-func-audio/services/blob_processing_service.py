from __future__ import annotations

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import UTC, datetime
from typing import Any, Callable, Optional

from config import AppConfig
from core.job_status import JobStatus
from core.logging import get_logger, preview, redact
from services.analysis_workflow import (
    build_ai_context,
    build_analysis_kwargs,
    get_prompt_inference_settings,
)
from services.analysis_service import AnalysisServiceError
from services.cosmos_service import CosmosServiceError
from services.fast_transcription_service import TranscriptionServiceError
from services.storage_service import StorageServiceError
from services.artifact_naming import (
    get_system_generated_tag,
    is_reprocess_artifact,
    is_system_generated_file,
)


logger = get_logger(__name__)

BLOB_PROCESSING_ERRORS = (
    RuntimeError,
    ValueError,
    TypeError,
    KeyError,
    asyncio.TimeoutError,
    AnalysisServiceError,
    CosmosServiceError,
    StorageServiceError,
    TranscriptionServiceError,
)

COSMOS_INIT_TIMEOUT_SECONDS = 10
DEFAULT_LOOKUP_RETRIES = 6
DEFAULT_LOOKUP_DELAY_SECONDS = 0.0


class BlobProcessingService:
    def __init__(
        self,
        *,
        config_factory: Callable[[], AppConfig] = AppConfig,
        storage_service_factory: Callable[[], Any],
        transcription_service_factory: Callable[[], Any],
        analysis_service_factory: Callable[[], Any],
    ) -> None:
        self.config_factory = config_factory
        self.storage_service_factory = storage_service_factory
        self.transcription_service_factory = transcription_service_factory
        self.analysis_service_factory = analysis_service_factory
        self.logger = get_logger(__name__)

    async def process_blob(
        self,
        myblob,
        *,
        correlation_id: str,
        blob_url: str,
        blob_path: str,
    ) -> None:
        cosmos_service = None
        job_id = None

        try:
            config = self.config_factory()
            self.logger.debug(
                "blob.processing.started",
                correlation_id=correlation_id,
                blob_path=blob_path,
            )

            if is_system_generated_file(blob_path):
                self.logger.info(
                    "blob.processing.skipped_system_generated",
                    correlation_id=correlation_id,
                    blob_path=blob_path,
                )
                return

            blob_path_without_extension, blob_extension = os.path.splitext(blob_path)
            if blob_extension not in config.supported_extensions:
                self.logger.info(
                    "blob.processing.skipped_unsupported_extension",
                    correlation_id=correlation_id,
                    blob_path=blob_path,
                    extension=blob_extension,
                )
                return

            if is_reprocess_artifact(blob_path):
                self.logger.info(
                    "blob.processing.skipped_reprocess_artifact",
                    correlation_id=correlation_id,
                    blob_path=blob_path,
                    reason="Pattern matches reprocess/analysis output",
                )
                return

            from services.file_processing_service import FileProcessingService

            cosmos_service = self.create_cosmos_service(
                config,
                correlation_id=correlation_id,
                blob_path=blob_path,
            )
            if not cosmos_service:
                return

            analysis_service = self.analysis_service_factory()
            storage_service = self.storage_service_factory()
            file_processing_service = FileProcessingService(config)
            file_type = file_processing_service.get_file_type(blob_extension)

            if file_type == "unsupported":
                self.logger.warning(
                    "blob.processing.unsupported_file_type",
                    correlation_id=correlation_id,
                    blob_extension=blob_extension,
                    blob_path=blob_path,
                )
                return

            path_without_container = blob_path_without_extension[
                len(config.storage_recordings_container) + 1:
            ]
            blob_url = f"{config.storage_account_url}/{myblob.name}"

            self.logger.info(
                "blob.processing.file_selected",
                correlation_id=correlation_id,
                file_type=file_type,
                file_extension=blob_extension,
                blob_path=blob_path,
                path_without_container=path_without_container,
            )

            file_doc = await self.resolve_file_document(
                myblob,
                config=config,
                cosmos_service=cosmos_service,
                blob_url=blob_url,
                blob_path=blob_path,
                correlation_id=correlation_id,
            )
            if not file_doc:
                self.logger.error(
                    "blob.processing.file_document_missing",
                    correlation_id=correlation_id,
                    blob_path=blob_path,
                    blob_url=redact(blob_url, keep=120),
                )
                raise ValueError(f"File document not found: {blob_path}")

            job_id = file_doc["id"]
            current_status = file_doc.get("status", "")
            self.logger.debug(
                "blob.processing.file_document_loaded",
                correlation_id=correlation_id,
                job_id=job_id,
                status=current_status,
            )

            if current_status in [
                JobStatus.COMPLETED,
                JobStatus.TRANSCRIBING,
                JobStatus.TRANSCRIBED,
                JobStatus.ANALYSING,
            ]:
                self.logger.info(
                    "blob.processing.skipped_existing_status",
                    correlation_id=correlation_id,
                    job_id=job_id,
                    status=current_status,
                )
                return

            self.logger.debug(
                "blob.processing.file_document_metadata",
                correlation_id=correlation_id,
                job_id=job_id,
                prompt_subcategory_id=file_doc.get("prompt_subcategory_id", "NOT_FOUND"),
                has_session_data="pre_session_form_data" in file_doc,
            )

            formatted_text = self.process_input_file(
                file_type=file_type,
                blob_url=blob_url,
                blob_extension=blob_extension,
                path_without_container=path_without_container,
                job_id=job_id,
                file_doc=file_doc,
                config=config,
                cosmos_service=cosmos_service,
                storage_service=storage_service,
                file_processing_service=file_processing_service,
                correlation_id=correlation_id,
            )
            await self.run_analysis(
                formatted_text=formatted_text,
                path_without_container=path_without_container,
                job_id=job_id,
                file_doc=file_doc,
                config=config,
                cosmos_service=cosmos_service,
                storage_service=storage_service,
                analysis_service=analysis_service,
                blob_path=blob_path,
                correlation_id=correlation_id,
            )
        except BLOB_PROCESSING_ERRORS as exc:
            self.logger.exception(
                "blob.processing.failed",
                correlation_id=correlation_id,
                blob_path=blob_path,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            self.mark_job_failed(
                job_id=job_id,
                cosmos_service=cosmos_service,
                blob_url=blob_url,
                blob_path=blob_path,
                correlation_id=correlation_id,
                error_message=str(exc),
            )
            raise

    def create_cosmos_service(self, config: AppConfig, *, correlation_id: str, blob_path: str):
        from services.cosmos_service import CosmosService

        self.logger.info(
            "blob.cosmos.initializing",
            correlation_id=correlation_id,
            blob_path=blob_path,
            timeout_seconds=COSMOS_INIT_TIMEOUT_SECONDS,
        )

        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(CosmosService, config)
                return future.result(timeout=COSMOS_INIT_TIMEOUT_SECONDS)
        except FuturesTimeout:
            self.logger.error(
                "blob.cosmos.initialization_timed_out",
                correlation_id=correlation_id,
                blob_path=blob_path,
                timeout_seconds=COSMOS_INIT_TIMEOUT_SECONDS,
            )
            return None

    async def resolve_file_document(
        self,
        myblob,
        *,
        config,
        cosmos_service,
        blob_url: str,
        blob_path: str,
        correlation_id: str,
    ):
        file_doc = None
        blob_metadata = getattr(myblob, "metadata", None) or {}
        metadata_job_id = blob_metadata.get("job_id") if isinstance(blob_metadata, dict) else None

        if metadata_job_id:
            self.logger.info(
                "blob.lookup.metadata_job_id_found",
                correlation_id=correlation_id,
                job_id=metadata_job_id,
                blob_path=blob_path,
            )
            try:
                file_doc = cosmos_service.get_job_by_id(metadata_job_id)
                if file_doc:
                    self.logger.debug(
                        "blob.lookup.metadata_job_loaded",
                        correlation_id=correlation_id,
                        job_id=metadata_job_id,
                    )
                else:
                    self.logger.warning(
                        "blob.lookup.metadata_job_missing",
                        correlation_id=correlation_id,
                        job_id=metadata_job_id,
                        blob_path=blob_path,
                    )
            except BLOB_PROCESSING_ERRORS:
                self.logger.warning(
                    "blob.lookup.metadata_job_failed",
                    correlation_id=correlation_id,
                    job_id=metadata_job_id,
                    blob_path=blob_path,
                    exc_info=True,
                )

        if file_doc:
            return file_doc

        max_retries, retry_delay = self.lookup_retry_settings(config)
        for attempt in range(1, max_retries + 1):
            self.logger.debug(
                "blob.lookup.url_lookup_attempt",
                correlation_id=correlation_id,
                blob_url=redact(blob_url, keep=60),
                attempt=attempt,
                max_retries=max_retries,
            )
            file_doc = cosmos_service.get_file_by_blob_url(blob_url)
            if file_doc:
                return file_doc

            self.logger.warning(
                "blob.lookup.file_document_retry_scheduled",
                correlation_id=correlation_id,
                blob_path=blob_path,
                attempt=attempt,
                max_retries=max_retries,
                retry_delay_seconds=retry_delay,
            )
            await asyncio.sleep(retry_delay)

        return None

    def mark_job_failed(
        self,
        *,
        job_id: Optional[str],
        cosmos_service,
        blob_url: str,
        blob_path: str,
        correlation_id: str,
        error_message: str,
    ) -> None:
        try:
            if job_id and cosmos_service:
                cosmos_service.update_job_status(
                    job_id,
                    JobStatus.FAILED,
                    error_message=error_message,
                    analysis_in_progress=False,
                )
                return

            if not cosmos_service:
                cosmos_service = self.create_cosmos_service(
                    self.config_factory(),
                    correlation_id=correlation_id,
                    blob_path=blob_path,
                )
                if not cosmos_service:
                    return

            file_doc = cosmos_service.get_file_by_blob_url(blob_url)
            if file_doc:
                cosmos_service.update_job_status(
                    file_doc["id"],
                    JobStatus.FAILED,
                    error_message=error_message,
                    analysis_in_progress=False,
                )
        except BLOB_PROCESSING_ERRORS:
            self.logger.exception(
                "blob.processing.mark_failed_failed",
                correlation_id=correlation_id,
                blob_path=blob_path,
            )

    def process_input_file(
        self,
        *,
        file_type: str,
        blob_url: str,
        blob_extension: str,
        path_without_container: str,
        job_id: str,
        file_doc: dict[str, Any],
        config,
        cosmos_service,
        storage_service,
        file_processing_service,
        correlation_id: str,
    ) -> str:
        if file_type == "audio":
            return process_audio_file(
                correlation_id=correlation_id,
                config=config,
                blob_url=blob_url,
                path_without_container=path_without_container,
                job_id=job_id,
                cosmos_service=cosmos_service,
                storage_service=storage_service,
                transcription_service_factory=self.transcription_service_factory,
                file_doc=file_doc,
            )

        if file_type not in ("text", "document"):
            raise ValueError(f"Unsupported file type: {file_type}")

        cosmos_service.update_job_status(job_id, JobStatus.TRANSCRIBING)
        self.logger.info(
            "blob.document_processing.started",
            correlation_id=correlation_id,
            file_type=file_type,
            status=JobStatus.TRANSCRIBING,
        )
        formatted_text = file_processing_service.process_file(blob_url, blob_extension)

        self.logger.info(
            "blob.document_processing.upload_started",
            correlation_id=correlation_id,
            file_type=file_type,
            text_length=len(formatted_text),
        )
        processed_text_blob_url = storage_service.upload_text(
            container_name=config.storage_recordings_container,
            blob_name=f"{path_without_container}_{get_system_generated_tag()}_processed_text.txt",
            text_content=formatted_text,
        )
        cosmos_service.update_job_status(
            job_id,
            JobStatus.TRANSCRIBED,
            transcription_file_path=processed_text_blob_url,
        )
        self.logger.info(
            "blob.document_processing.completed",
            correlation_id=correlation_id,
            status=JobStatus.TRANSCRIBED,
        )
        return formatted_text

    async def run_analysis(
        self,
        *,
        formatted_text: str,
        path_without_container: str,
        job_id: str,
        file_doc: dict[str, Any],
        config,
        cosmos_service,
        storage_service,
        analysis_service,
        blob_path: str,
        correlation_id: str,
    ) -> None:
        prompt_subcategory_id = file_doc["prompt_subcategory_id"]
        self.logger.info(
            "blob.analysis.prompt_lookup_started",
            correlation_id=correlation_id,
            prompt_subcategory_id=prompt_subcategory_id,
        )

        prompt_text = cosmos_service.get_prompts(prompt_subcategory_id)
        if not prompt_text:
            self.logger.error(
                "blob.analysis.prompt_missing",
                correlation_id=correlation_id,
                prompt_subcategory_id=prompt_subcategory_id,
            )
            raise ValueError("No prompts found")

        prompt_metadata, prompt_settings = get_prompt_inference_settings(
            cosmos_service,
            prompt_subcategory_id,
            correlation_id=correlation_id,
            job_id=job_id,
            logger=self.logger,
            log_prefix="blob.",
        )
        analysis_model = prompt_settings["analysis_model"]
        analysis_reasoning = prompt_settings["analysis_reasoning"]
        analysis_provider = prompt_settings["analysis_provider"]

        self.logger.info(
            "blob.analysis.prompt_loaded",
            correlation_id=correlation_id,
            prompt_length=len(prompt_text),
            prompt_preview=preview(prompt_text, n=150),
        )

        session_data = file_doc.get("pre_session_form_data")
        ai_context = build_ai_context(user_prompt=prompt_text, session_data=session_data)
        self.logger.info(
            "blob.analysis.started",
            correlation_id=correlation_id,
            job_id=job_id,
            content_preview=preview(formatted_text, n=200),
            has_session_data=bool(session_data),
            using_model=analysis_model or "config default",
            using_reasoning=(
                analysis_reasoning
                if "analysis_reasoning" in prompt_metadata
                else "config default"
            ),
        )
        cosmos_service.update_job_status(
            job_id,
            JobStatus.ANALYSING,
            analysis_started_at=datetime.now(UTC).isoformat(),
            analysis_in_progress=True,
        )

        analysis_kwargs = build_analysis_kwargs(
            conversation=formatted_text,
            context=ai_context,
            prompt_metadata=prompt_metadata,
            settings=prompt_settings,
        )
        analysis_result = await self.analyze_content(
            formatted_text=formatted_text,
            prompt_metadata=prompt_metadata,
            config=config,
            cosmos_service=cosmos_service,
            analysis_service=analysis_service,
            analysis_kwargs=analysis_kwargs,
            job_id=job_id,
            correlation_id=correlation_id,
        )
        self.logger.debug(
            "blob.analysis.completed",
            correlation_id=correlation_id,
            job_id=job_id,
        )

        analysis_file_url = self.upload_analysis_document(
            analysis_text=analysis_result["analysis_text"],
            path_without_container=path_without_container,
            storage_service=storage_service,
            job_id=job_id,
            correlation_id=correlation_id,
        )
        cosmos_service.update_job_status(
            job_id,
            JobStatus.COMPLETED,
            analysis_file_path=analysis_file_url,
            analysis_completed_at=datetime.now(UTC).isoformat(),
            analysis_in_progress=False,
            analysis_provider=analysis_provider,
        )
        self.logger.info(
            "blob.processing.completed",
            correlation_id=correlation_id,
            job_id=job_id,
            blob_path=blob_path,
            analysis_provider=analysis_provider or "config default",
        )

    async def analyze_content(
        self,
        *,
        formatted_text: str,
        prompt_metadata: dict[str, Any],
        config,
        cosmos_service,
        analysis_service,
        analysis_kwargs: dict[str, Any],
        job_id: str,
        correlation_id: str,
    ) -> dict[str, Any]:
        enhanced_reasoning_enabled = prompt_metadata.get("enhanced_reasoning_enabled", False)
        prompt_constraints_raw = prompt_metadata.get("prompt_constraints") or {}
        all_prompts: dict = prompt_metadata.get("prompts", {})

        if enhanced_reasoning_enabled and all_prompts:
            self.logger.info(
                "blob.analysis.enhanced_reasoning_started",
                correlation_id=correlation_id,
                job_id=job_id,
            )
            try:
                from services.enhanced_reasoning.orchestration_service import EnhancedReasoningService

                er_service = EnhancedReasoningService(config=config)
                er_text, er_metadata = await er_service.run(
                    transcript=formatted_text,
                    prompts=all_prompts,
                    prompt_constraints_raw=prompt_constraints_raw,
                )
                cosmos_service.update_job_status(
                    job_id,
                    JobStatus.ANALYSING,
                    enhanced_reasoning_metadata={
                        "iterations": er_metadata.iterations,
                        "flagged_sections": er_metadata.flagged_sections,
                    },
                )
                return {"analysis_text": er_text}
            except BLOB_PROCESSING_ERRORS as exc:
                self.logger.warning(
                    "blob.analysis.enhanced_reasoning_failed",
                    correlation_id=correlation_id,
                    job_id=job_id,
                    error=str(exc),
                    error_type=type(exc).__name__,
                    exc_info=True,
                )

        return analysis_service.analyze_conversation(**analysis_kwargs)

    def upload_analysis_document(
        self,
        *,
        analysis_text: str,
        path_without_container: str,
        storage_service,
        job_id: str,
        correlation_id: str,
    ) -> str:
        self.logger.info(
            "blob.analysis_document.upload_started",
            correlation_id=correlation_id,
            job_id=job_id,
        )
        tag = get_system_generated_tag()
        try:
            docx_blob_url = storage_service.generate_and_upload_docx(
                analysis_text,
                f"{path_without_container}_{tag}_analysis.docx",
            )
            self.logger.debug(
                "blob.analysis_document.docx_uploaded",
                correlation_id=correlation_id,
                job_id=job_id,
                blob_url=redact(docx_blob_url, keep=60),
            )
            return docx_blob_url
        except BLOB_PROCESSING_ERRORS as docx_error:
            self.logger.warning(
                "blob.analysis_document.docx_failed_pdf_fallback",
                correlation_id=correlation_id,
                job_id=job_id,
                error=str(docx_error),
                error_type=type(docx_error).__name__,
            )
            pdf_blob_url = storage_service.generate_and_upload_pdf(
                analysis_text,
                f"{path_without_container}_{tag}_analysis.pdf",
            )
            self.logger.debug(
                "blob.analysis_document.pdf_uploaded",
                correlation_id=correlation_id,
                job_id=job_id,
                blob_url=redact(pdf_blob_url, keep=60),
            )
            return pdf_blob_url

    @staticmethod
    def lookup_retry_settings(config) -> tuple[int, float]:
        retries = getattr(config, "blob_trigger_lookup_retries", DEFAULT_LOOKUP_RETRIES)
        delay_seconds = getattr(
            config,
            "blob_trigger_lookup_delay_seconds",
            DEFAULT_LOOKUP_DELAY_SECONDS,
        )
        if not isinstance(retries, (int, float, str)):
            retries = DEFAULT_LOOKUP_RETRIES
        if not isinstance(delay_seconds, (int, float, str)):
            delay_seconds = DEFAULT_LOOKUP_DELAY_SECONDS

        return (
            int(retries),
            float(delay_seconds),
        )


def process_audio_file(
    *,
    correlation_id: str,
    config,
    blob_url: str,
    path_without_container: str,
    job_id: str,
    cosmos_service,
    storage_service,
    transcription_service_factory: Callable[[], Any],
    file_doc: Optional[dict[str, Any]] = None,
) -> str:
    logger.info(
        "blob.audio_processing.started",
        correlation_id=correlation_id,
        job_id=job_id,
    )

    cosmos_service.update_job_status(job_id, JobStatus.TRANSCRIBING)
    logger.debug(
        "blob.audio_processing.status_marked_transcribing",
        correlation_id=correlation_id,
        job_id=job_id,
    )

    transcription_service = transcription_service_factory()
    audio_duration_minutes = None
    if file_doc:
        audio_duration_minutes = file_doc.get("audio_duration_minutes")
        if audio_duration_minutes:
            logger.info(
                "blob.audio_processing.duration_loaded",
                correlation_id=correlation_id,
                job_id=job_id,
                audio_duration_minutes=f"{audio_duration_minutes:.1f}",
            )

    logger.info(
        "blob.audio_processing.transcription_started",
        correlation_id=correlation_id,
        job_id=job_id,
        blob_url=redact(blob_url, keep=60),
    )
    transcription_id = transcription_service.submit_transcription_job(
        blob_url,
        audio_duration_minutes=audio_duration_minutes,
    )
    logger.debug(
        "blob.audio_processing.transcription_submitted",
        correlation_id=correlation_id,
        job_id=job_id,
        transcription_id=transcription_id,
    )

    cosmos_service.update_job_status(
        job_id,
        JobStatus.TRANSCRIBING,
        transcription_id=transcription_id,
    )
    logger.debug(
        "blob.audio_processing.transcription_id_persisted",
        correlation_id=correlation_id,
        job_id=job_id,
        transcription_id=transcription_id,
    )

    logger.info(
        "blob.audio_processing.waiting_for_transcription",
        correlation_id=correlation_id,
        transcription_id=transcription_id,
    )
    status_data = transcription_service.check_status(transcription_id)
    logger.debug(
        "blob.audio_processing.transcription_status_checked",
        correlation_id=correlation_id,
        transcription_id=transcription_id,
    )

    formatted_text = transcription_service.get_results(status_data)
    if not formatted_text.strip():
        raise ValueError("Transcription completed without any recognized text")

    logger.debug(
        "blob.audio_processing.transcription_results_loaded",
        correlation_id=correlation_id,
        transcription_id=transcription_id,
        text_length=len(formatted_text),
        text_preview=preview(formatted_text, n=150),
    )

    logger.info(
        "blob.audio_processing.transcription_upload_started",
        correlation_id=correlation_id,
        job_id=job_id,
    )
    transcription_blob_url = storage_service.upload_text(
        container_name=config.storage_recordings_container,
        blob_name=f"{path_without_container}_{get_system_generated_tag()}_transcription.txt",
        text_content=formatted_text,
    )
    logger.debug(
        "blob.audio_processing.transcription_uploaded",
        correlation_id=correlation_id,
        job_id=job_id,
        blob_url=redact(transcription_blob_url, keep=60),
    )

    cosmos_service.update_job_status(
        job_id,
        JobStatus.TRANSCRIBED,
        transcription_file_path=transcription_blob_url,
    )
    logger.debug(
        "blob.audio_processing.status_marked_transcribed",
        correlation_id=correlation_id,
        job_id=job_id,
    )

    return formatted_text
