from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import UploadFile

from ...core.errors.domain import (
    ApplicationError,
    ErrorCode,
    PermissionError as ApplicationPermissionError,
    ResourceNotFoundError,
    ValidationError,
)
from ...core.logging import get_logger
from ...models.prompt_visibility import can_user_access_subcategory
from ...services.interfaces import AnalyticsServiceInterface, PromptServiceInterface
from ...services.jobs.job_service import JobService
from ...services.storage.blob_service import StorageService
from ...utils.file_utils import FileUtils
from ...utils.input_validation import InputValidator

logger = get_logger(__name__)

UPLOAD_CONCURRENCY_LIMIT = 5
MAX_FILE_SIZE_BYTES = 1_073_741_824
UPLOAD_BEST_EFFORT_ERRORS = (RuntimeError, OSError, ValueError, TypeError)

_upload_semaphore = asyncio.Semaphore(UPLOAD_CONCURRENCY_LIMIT)


async def validate_prompt_subcategory_usage(
    *,
    prompt_service: PromptServiceInterface,
    current_user: Dict[str, Any],
    prompt_subcategory_id: Optional[str],
    prompt_category_id: Optional[str] = None,
) -> None:
    if not prompt_subcategory_id:
        return

    subcategory = await prompt_service.get_subcategory(prompt_subcategory_id)
    if not subcategory:
        raise ResourceNotFoundError("Prompt subcategory", prompt_subcategory_id)

    if not can_user_access_subcategory(current_user, subcategory):
        raise ApplicationPermissionError("You do not have access to use this prompt type.")

    if (
        prompt_category_id
        and subcategory.get("category_id")
        and subcategory.get("category_id") != prompt_category_id
    ):
        raise ValidationError(
            "Prompt category does not match the selected prompt type.",
            field="prompt_category_id",
        )


class UploadWorkflowService:
    """Own upload admission, metadata construction, job creation, and analytics."""

    def __init__(
        self,
        *,
        storage_service: StorageService,
        job_service: JobService,
        analytics_service: AnalyticsServiceInterface,
        prompt_service: PromptServiceInterface,
        upload_semaphore: asyncio.Semaphore | None = None,
    ) -> None:
        self.storage_service = storage_service
        self.job_service = job_service
        self.analytics_service = analytics_service
        self.prompt_service = prompt_service
        self.upload_semaphore = upload_semaphore or _upload_semaphore

    async def request_upload_token(
        self,
        *,
        filename: str,
        file_size: Optional[int],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        user_id = current_user.get("id")

        safe_filename = self._safe_filename(filename, user_id)
        if file_size is not None and file_size > MAX_FILE_SIZE_BYTES:
            raise ApplicationError(
                f"File too large. Maximum allowed size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
                ErrorCode.INVALID_INPUT,
                status_code=413,
            )

        sas_info = await self.storage_service.generate_upload_sas(safe_filename)
        return {
            "sas_url": sas_info["sas_url"],
            "blob_url": sas_info["blob_url"],
            "blob_name": sas_info["blob_name"],
            "container": sas_info["container"],
            "expiry": sas_info["expiry"],
            "filename": safe_filename,
        }

    async def complete_direct_upload(
        self,
        *,
        blob_url: str,
        filename: str,
        current_user: Dict[str, Any],
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
        pre_session_form_data: Optional[Dict[str, Any]],
        audio_duration_seconds: Optional[float],
        audio_duration_minutes: Optional[float],
        recording_settings: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        user_id = current_user.get("id")
        safe_filename = self._safe_filename(filename, user_id)

        await validate_prompt_subcategory_usage(
            prompt_service=self.prompt_service,
            current_user=current_user,
            prompt_subcategory_id=prompt_subcategory_id,
            prompt_category_id=prompt_category_id,
        )

        metadata = self._build_direct_metadata(
            prompt_category_id=prompt_category_id,
            prompt_subcategory_id=prompt_subcategory_id,
            pre_session_form_data=pre_session_form_data,
            audio_duration_seconds=audio_duration_seconds,
            audio_duration_minutes=audio_duration_minutes,
            recording_settings=recording_settings,
        )

        try:
            created_job = await self.job_service.create_job_from_blob(
                blob_url=blob_url,
                original_filename=safe_filename,
                owner_user=current_user,
                metadata=metadata,
            )
            self._schedule_job_created_tracking(
                created_job=created_job,
                user_id=user_id,
                filename=safe_filename,
                metadata=metadata,
                upload_method="direct",
                file_size_bytes=created_job.get("file_size_bytes", 0) or 0,
            )
        except FileNotFoundError as exc:
            raise ResourceNotFoundError(
                "Uploaded blob",
                blob_url,
                {"reason": "The SAS token may have expired."},
            ) from exc
        return created_job

    async def upload_job_file(
        self,
        *,
        file: UploadFile,
        current_user: Dict[str, Any],
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
        pre_session_form_data: Optional[str],
    ) -> Dict[str, Any]:
        user_id = current_user.get("id")
        await validate_prompt_subcategory_usage(
            prompt_service=self.prompt_service,
            current_user=current_user,
            prompt_subcategory_id=prompt_subcategory_id,
            prompt_category_id=prompt_category_id,
        )

        safe_filename = self._safe_filename(file.filename, user_id)
        tmp_dir = tempfile.mkdtemp(prefix="community_upload_")
        tmp_path = os.path.join(tmp_dir, safe_filename)
        acquired_slot = False

        try:
            await self._acquire_upload_slot(user_id)
            acquired_slot = True
            self._validate_temp_path(tmp_path=tmp_path, tmp_dir=tmp_dir, user_id=user_id, file=file)
            self._save_upload(file=file, tmp_path=tmp_path, user_id=user_id)
            metadata = self._build_multipart_metadata(
                prompt_category_id=prompt_category_id,
                prompt_subcategory_id=prompt_subcategory_id,
                pre_session_form_data=pre_session_form_data,
                filename=safe_filename,
                tmp_path=tmp_path,
            )

            created_job = await self.job_service.upload_and_create_job(
                tmp_path,
                safe_filename,
                current_user,
                metadata=metadata,
            )
            file_size_bytes = self._get_file_size_for_analytics(tmp_path)
            self._schedule_job_created_tracking(
                created_job=created_job,
                user_id=user_id,
                filename=safe_filename,
                metadata=metadata,
                upload_method="multipart",
                file_size_bytes=file_size_bytes,
            )
            return created_job
        finally:
            if acquired_slot:
                self._release_upload_slot()
            self._cleanup_temp_upload(tmp_path, tmp_dir)

    def _safe_filename(self, filename: Optional[str], user_id: Optional[str]) -> str:
        safe_filename = InputValidator.sanitize_filename(filename or "")
        if not safe_filename or safe_filename == "unnamed":
            suffix = (user_id or "unknown")[:8]
            safe_filename = f"upload_{suffix}.bin"
        return safe_filename

    def _build_direct_metadata(
        self,
        *,
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
        pre_session_form_data: Optional[Dict[str, Any]],
        audio_duration_seconds: Optional[float],
        audio_duration_minutes: Optional[float],
        recording_settings: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {}
        if prompt_category_id:
            metadata["prompt_category_id"] = prompt_category_id
        if prompt_subcategory_id:
            metadata["prompt_subcategory_id"] = prompt_subcategory_id
        if pre_session_form_data:
            metadata["pre_session_form_data"] = pre_session_form_data
        if audio_duration_seconds is not None:
            metadata["audio_duration_seconds"] = audio_duration_seconds
            if audio_duration_minutes is None:
                metadata["audio_duration_minutes"] = float(audio_duration_seconds) / 60.0
        if audio_duration_minutes is not None:
            metadata["audio_duration_minutes"] = audio_duration_minutes
        if recording_settings:
            metadata["recording_settings"] = recording_settings
        return metadata

    def _build_multipart_metadata(
        self,
        *,
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
        pre_session_form_data: Optional[str],
        filename: str,
        tmp_path: str,
    ) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {}
        if prompt_category_id:
            metadata["prompt_category_id"] = prompt_category_id
        if prompt_subcategory_id:
            metadata["prompt_subcategory_id"] = prompt_subcategory_id
        if pre_session_form_data:
            try:
                metadata["pre_session_form_data"] = json.loads(pre_session_form_data)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "upload_pre_session_form_data_parse_failed",
                    error=str(exc),
                    data_length=len(pre_session_form_data),
                )
                metadata["pre_session_form_data"] = pre_session_form_data

        self._add_audio_duration_metadata(filename=filename, tmp_path=tmp_path, metadata=metadata)
        return metadata

    async def _acquire_upload_slot(self, user_id: Optional[str]) -> None:
        try:
            await asyncio.wait_for(self.upload_semaphore.acquire(), timeout=0.01)
        except asyncio.TimeoutError:
            logger.warning(
                "upload_concurrency_limit_reached",
                user_id=user_id,
                concurrency_limit=UPLOAD_CONCURRENCY_LIMIT,
            )
            raise ApplicationError(
                "Too many concurrent uploads, try again later.",
                ErrorCode.QUOTA_EXCEEDED,
                status_code=429,
            )

    def _release_upload_slot(self) -> None:
        self.upload_semaphore.release()

    def _validate_temp_path(self, *, tmp_path: str, tmp_dir: str, user_id: Optional[str], file: UploadFile) -> None:
        resolved_tmp = Path(tmp_path).resolve()
        resolved_dir = Path(tmp_dir).resolve()
        if not str(resolved_tmp).startswith(str(resolved_dir)):
            logger.error(
                "upload_path_traversal_detected",
                user_id=user_id,
                original_filename=file.filename,
                tmp_dir=tmp_dir,
                tmp_path=tmp_path,
            )
            raise ValidationError("Invalid filename", field="filename")

    def _save_upload(self, *, file: UploadFile, tmp_path: str, user_id: Optional[str]) -> None:
        try:
            FileUtils.save_upload_to_temp(file, tmp_path, max_bytes=MAX_FILE_SIZE_BYTES)
        except FileUtils.UploadTooLargeError as exc:
            logger.warning("upload_rejected_too_large", user_id=user_id, error=str(exc))
            raise ApplicationError(str(exc), ErrorCode.INVALID_INPUT, status_code=413) from exc

    def _add_audio_duration_metadata(self, *, filename: str, tmp_path: str, metadata: Dict[str, Any]) -> None:
        file_ext = FileUtils.get_extension(filename)
        if file_ext.lower() not in FileUtils.AUDIO_EXTENSIONS:
            return

        audio_secs = FileUtils.get_audio_duration(tmp_path)
        if audio_secs is None:
            return

        metadata["audio_duration_seconds"] = float(audio_secs)
        metadata["audio_duration_minutes"] = float(audio_secs) / 60.0
        logger.info(
            "upload_audio_duration_extracted",
            audio_duration_minutes=metadata["audio_duration_minutes"],
        )

    def _schedule_job_created_tracking(
        self,
        *,
        created_job: Dict[str, Any],
        user_id: Optional[str],
        filename: str,
        metadata: Dict[str, Any],
        upload_method: str,
        file_size_bytes: int,
    ) -> None:
        async def _track() -> None:
            try:
                analytics_meta = {
                    "has_file": True,
                    "file_size_bytes": file_size_bytes,
                    "prompt_category_id": metadata.get("prompt_category_id"),
                    "prompt_subcategory_id": metadata.get("prompt_subcategory_id"),
                    "job_status": created_job.get("status"),
                    "file_name": filename,
                    "file_extension": os.path.splitext(filename)[1].lstrip("."),
                    "upload_method": upload_method,
                }
                if created_job.get("audio_duration_seconds") is not None:
                    analytics_meta["audio_duration_seconds"] = created_job.get("audio_duration_seconds")
                if created_job.get("audio_duration_minutes") is not None:
                    analytics_meta["audio_duration_minutes"] = created_job.get("audio_duration_minutes")

                await self.analytics_service.track_job_event(
                    job_id=created_job.get("id"),
                    user_id=user_id,
                    event_type="job_created",
                    metadata=analytics_meta,
                )
            except UPLOAD_BEST_EFFORT_ERRORS:
                logger.exception(
                    "upload_analytics_tracking_failed",
                    user_id=user_id,
                    job_id=created_job.get("id"),
                    upload_method=upload_method,
                )

        asyncio.create_task(_track())

    def _get_file_size_for_analytics(self, tmp_path: str) -> int:
        try:
            return os.path.getsize(tmp_path)
        except (OSError, IOError) as exc:
            logger.debug(
                "upload_analytics_file_size_unavailable",
                tmp_path=tmp_path,
                error_type=type(exc).__name__,
            )
            return 0

    def _cleanup_temp_upload(self, tmp_path: str, tmp_dir: str) -> None:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
            if tmp_dir and os.path.exists(tmp_dir):
                os.rmdir(tmp_dir)
        except OSError as exc:
            logger.warning("upload_temp_cleanup_failed", tmp_dir=tmp_dir, error=str(exc))
