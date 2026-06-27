from __future__ import annotations

import asyncio
import json
import os
import tempfile
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
from ...models.prompt_visibility import (
    can_user_use_prompt_visibility,
    normalize_prompt_visibility,
)
from ...utils.file_utils import FileUtils
from ..interfaces import AnalyticsServiceInterface, PromptServiceInterface
from .job_service import JobService

logger = get_logger(__name__)

UPLOAD_CONCURRENCY_LIMIT = 5
MAX_UPLOAD_BYTES = 1_073_741_824
UPLOAD_BEST_EFFORT_ERRORS = (RuntimeError, OSError, ValueError, TypeError)

_shared_upload_semaphore = asyncio.Semaphore(UPLOAD_CONCURRENCY_LIMIT)


class JobUploadService:
    """Own the upload-to-job workflow behind the jobs route."""

    def __init__(
        self,
        job_service: JobService,
        analytics_service: AnalyticsServiceInterface,
        prompt_service: PromptServiceInterface,
        *,
        upload_semaphore: Optional[asyncio.Semaphore] = None,
    ) -> None:
        self.job_service = job_service
        self.analytics_service = analytics_service
        self.prompt_service = prompt_service
        self.upload_semaphore = upload_semaphore or _shared_upload_semaphore

    async def create_job_from_upload(
        self,
        *,
        file: UploadFile,
        current_user: Dict[str, Any],
        prompt_category_id: Optional[str] = None,
        prompt_subcategory_id: Optional[str] = None,
        pre_session_form_data: Optional[str] = None,
    ) -> Dict[str, Any]:
        user_id = current_user.get("id")

        await self._validate_prompt_access(
            current_user=current_user,
            prompt_category_id=prompt_category_id,
            prompt_subcategory_id=prompt_subcategory_id,
        )

        tmp_dir = tempfile.mkdtemp(prefix="sonic_upload_")
        safe_filename = FileUtils.sanitize_upload_filename(
            file.filename,
            fallback_stem=f"upload_{(user_id or 'unknown')[:8]}",
        )
        tmp_path = self._build_temp_upload_path(filename=safe_filename, tmp_dir=tmp_dir)

        await self._acquire_upload_slot(user_id)
        try:
            self._save_upload(file, tmp_path, user_id)
            self._validate_saved_audio(tmp_path)
            metadata = self._build_metadata(
                file=file,
                tmp_path=tmp_path,
                prompt_category_id=prompt_category_id,
                prompt_subcategory_id=prompt_subcategory_id,
                pre_session_form_data=pre_session_form_data,
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
                current_user=current_user,
                file=file,
                file_size_bytes=file_size_bytes,
                metadata=metadata,
            )
            return created_job
        finally:
            self._release_upload_slot()
            self._cleanup_temp_upload(tmp_path, tmp_dir)

    async def _validate_prompt_access(
        self,
        *,
        current_user: Dict[str, Any],
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
    ) -> None:
        if not prompt_subcategory_id:
            return

        subcategory = await self.prompt_service.get_subcategory(prompt_subcategory_id)
        if not subcategory:
            raise ResourceNotFoundError("Prompt subcategory", prompt_subcategory_id)

        visibility = normalize_prompt_visibility(subcategory.get("prompt_visibility"))
        if not can_user_use_prompt_visibility(current_user, visibility):
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

    async def _acquire_upload_slot(self, user_id: Optional[str]) -> None:
        try:
            await asyncio.wait_for(self.upload_semaphore.acquire(), timeout=0.01)
        except asyncio.TimeoutError:
            logger.warning(
                "job_upload_concurrency_limit_reached",
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

    def _build_temp_upload_path(self, *, filename: str, tmp_dir: str) -> str:
        try:
            return FileUtils.build_temp_upload_path(filename, tmp_dir)
        except ValueError as exc:
            raise ValidationError("Invalid filename", field="filename") from exc

    def _save_upload(self, file: UploadFile, tmp_path: str, user_id: Optional[str]) -> None:
        try:
            FileUtils.save_upload_to_temp(file, tmp_path, max_bytes=MAX_UPLOAD_BYTES)
        except FileUtils.UploadTooLargeError as exc:
            logger.warning("job_upload_file_too_large", user_id=user_id, error=str(exc))
            raise ApplicationError(str(exc), ErrorCode.INVALID_INPUT, status_code=413) from exc

    def _validate_saved_audio(self, tmp_path: str) -> None:
        is_valid, message = FileUtils.validate_audio_file(
            tmp_path,
            max_size_mb=MAX_UPLOAD_BYTES // (1024 * 1024),
        )
        if not is_valid:
            raise ValidationError(message, field="filename")

    def _build_metadata(
        self,
        *,
        file: UploadFile,
        tmp_path: str,
        prompt_category_id: Optional[str],
        prompt_subcategory_id: Optional[str],
        pre_session_form_data: Optional[str],
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
                    "job_upload_pre_session_form_parse_failed",
                    error=str(exc),
                    data_length=len(pre_session_form_data),
                )
                metadata["pre_session_form_data"] = pre_session_form_data

        self._add_audio_duration_metadata(file=file, tmp_path=tmp_path, metadata=metadata)
        return metadata

    def _add_audio_duration_metadata(
        self,
        *,
        file: UploadFile,
        tmp_path: str,
        metadata: Dict[str, Any],
    ) -> None:
        file_ext = FileUtils.get_extension(file.filename) if file is not None else ""
        if file_ext.lower() not in FileUtils.AUDIO_EXTENSIONS:
            return

        audio_secs = FileUtils.get_audio_duration(tmp_path)
        if audio_secs is None:
            return

        metadata["audio_duration_seconds"] = float(audio_secs)
        metadata["audio_duration_minutes"] = float(audio_secs) / 60.0
        logger.info(
            "job_upload_audio_duration_extracted",
            duration_minutes=metadata["audio_duration_minutes"],
        )

    def _schedule_job_created_tracking(
        self,
        *,
        created_job: Dict[str, Any],
        current_user: Dict[str, Any],
        file: UploadFile,
        file_size_bytes: int,
        metadata: Dict[str, Any],
    ) -> None:
        async def _track() -> None:
            try:
                analytics_meta = {
                    "has_file": True,
                    "file_size_bytes": file_size_bytes,
                    "prompt_category_id": metadata.get("prompt_category_id"),
                    "prompt_subcategory_id": metadata.get("prompt_subcategory_id"),
                    "job_status": created_job.get("status"),
                    "file_name": file.filename if file is not None else None,
                    "file_extension": os.path.splitext(file.filename)[1].lstrip(".") if file is not None else None,
                }
                if created_job.get("audio_duration_seconds") is not None:
                    analytics_meta["audio_duration_seconds"] = created_job.get("audio_duration_seconds")
                if created_job.get("audio_duration_minutes") is not None:
                    analytics_meta["audio_duration_minutes"] = created_job.get("audio_duration_minutes")

                await self.analytics_service.track_job_event(
                    job_id=created_job.get("id"),
                    user_id=current_user.get("id"),
                    event_type="job_created",
                    metadata=analytics_meta,
                )
            except UPLOAD_BEST_EFFORT_ERRORS:
                logger.exception(
                    "job_creation_analytics_tracking_failed",
                    job_id=created_job.get("id"),
                    user_id=current_user.get("id"),
                )

        asyncio.create_task(_track())

    def _get_file_size_for_analytics(self, tmp_path: str) -> int:
        try:
            return os.path.getsize(tmp_path)
        except (OSError, IOError) as exc:
            logger.debug(
                "job_upload_file_size_lookup_failed",
                tmp_path=tmp_path,
                error_type=type(exc).__name__,
            )
            return 0

    def _cleanup_temp_upload(self, tmp_path: str, tmp_dir: str) -> None:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            if os.path.exists(tmp_dir):
                os.rmdir(tmp_dir)
        except OSError as exc:
            logger.warning("job_upload_temp_cleanup_failed", tmp_dir=tmp_dir, error=str(exc))
