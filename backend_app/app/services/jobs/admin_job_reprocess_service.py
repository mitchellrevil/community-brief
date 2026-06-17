from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict
import uuid

from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError, ValidationError
from ...core.logging import get_logger
from ...repositories.jobs import JobRepository
from ..storage.blob_service import StorageService

logger = get_logger(__name__)

ADMIN_REPROCESS_ERRORS = (RuntimeError, OSError, ValueError, TypeError)


class AdminJobReprocessService:
    """Owns admin blob reset workflow for job reprocessing."""

    def __init__(
        self,
        storage_service: StorageService,
        job_repository: JobRepository,
    ):
        self.repository = job_repository
        self.storage = storage_service

    async def reprocess_blob(self, job_id: str, current_user: Dict[str, Any]) -> Dict[str, Any]:
        correlation_id = str(uuid.uuid4())
        user_id = current_user.get("id") if isinstance(current_user, dict) else current_user

        logger.info(
            "admin_job_reprocess_started",
            job_id=job_id,
            user_id=user_id,
            correlation_id=correlation_id,
        )

        job = await self.repository.get_by_id(job_id)
        if not job:
            logger.warning(
                "admin_job_reprocess_job_missing",
                job_id=job_id,
                correlation_id=correlation_id,
            )
            raise ResourceNotFoundError("job", job_id)

        file_path = job.get("file_path")
        if not file_path:
            logger.warning(
                "admin_job_reprocess_file_path_missing",
                job_id=job_id,
                correlation_id=correlation_id,
            )
            raise ValidationError(
                "Job has no file_path (blob URL). Cannot reset blob for reprocessing.",
                field="file_path",
            )

        logger.info(
            "admin_job_reprocess_blob_download_started",
            job_id=job_id,
            file_path=file_path[:100],
            correlation_id=correlation_id,
        )
        try:
            blob_data = await self.storage.download_blob_bytes(file_path)
        except FileNotFoundError:
            logger.error(
                "admin_job_reprocess_blob_missing",
                exc_info=True,
                job_id=job_id,
                file_path=file_path[:100],
                correlation_id=correlation_id,
            )
            raise ValidationError("Original blob not found. Cannot reprocess.", field="file_path")
        except ADMIN_REPROCESS_ERRORS as exc:
            logger.error(
                "admin_job_reprocess_blob_download_failed",
                exc_info=True,
                job_id=job_id,
                correlation_id=correlation_id,
                error_type=type(exc).__name__,
            )
            raise ApplicationError(
                f"Failed to download blob: {str(exc)}",
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=500,
                details={"job_id": job_id, "correlation_id": correlation_id},
            )

        file_name = job.get("file_name", "audio")
        logger.info(
            "admin_job_reprocess_blob_upload_started",
            job_id=job_id,
            file_name=file_name,
            correlation_id=correlation_id,
        )
        try:
            new_blob_url = await self.storage.upload_blob_bytes(file_name, blob_data)
        except ADMIN_REPROCESS_ERRORS as exc:
            logger.error(
                "admin_job_reprocess_blob_upload_failed",
                exc_info=True,
                job_id=job_id,
                correlation_id=correlation_id,
                error_type=type(exc).__name__,
            )
            raise ApplicationError(
                f"Failed to re-upload blob: {str(exc)}",
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=500,
                details={"job_id": job_id, "correlation_id": correlation_id},
            )

        reset_timestamp = datetime.now(UTC).isoformat()

        job["status"] = "uploaded"
        job["file_path"] = new_blob_url
        job["transcription_file_path"] = None
        job["analysis_file_path"] = None
        job["analysis_attempts"] = []
        job["analysis_in_progress"] = False
        job["analysis_started_at"] = None
        job["analysis_completed_at"] = None
        job["error_message"] = None
        job["reset_at"] = reset_timestamp
        job["reset_by"] = user_id
        job["reset_correlation_id"] = correlation_id

        logger.info(
            "admin_job_reprocess_job_update_started",
            job_id=job_id,
            new_blob_url=new_blob_url[:100],
            correlation_id=correlation_id,
        )
        try:
            await self.repository.replace(job_id, job)
        except ADMIN_REPROCESS_ERRORS as exc:
            logger.error(
                "admin_job_reprocess_job_update_failed",
                exc_info=True,
                job_id=job_id,
                correlation_id=correlation_id,
                error_type=type(exc).__name__,
            )
            raise ApplicationError(
                f"Failed to update job document: {str(exc)}",
                error_code=ErrorCode.INTERNAL_ERROR,
                status_code=500,
                details={"job_id": job_id, "correlation_id": correlation_id},
            )

        logger.info(
            "admin_job_reprocess_completed",
            job_id=job_id,
            user_id=user_id,
            correlation_id=correlation_id,
        )

        return {
            "status": "success",
            "message": "Job reset and blob re-uploaded for reprocessing",
            "job_id": job_id,
            "blob_url": new_blob_url,
            "correlation_id": correlation_id,
        }
