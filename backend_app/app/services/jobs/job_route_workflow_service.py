"""HTTP-adjacent job workflows owned outside the route module."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from ...core.errors.domain import PermissionError, ResourceNotFoundError, ResourceNotReadyError, ValidationError
from ...services.interfaces import StorageServiceInterface
from ...utils.cache_utils import TTLCache
from .job_management_service import JobManagementService
from .job_permissions import JobPermissions, check_job_access
from .job_service import JobService


_jobs_cache = TTLCache[Dict[str, Any]](default_ttl=600.0)

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MEDIA_TYPE = "application/pdf"


async def invalidate_job_list_cache() -> None:
    """Clear cached job list responses after writes affect list freshness."""
    await _jobs_cache.invalidate("jobs:")


class JobRouteWorkflowService:
    def __init__(
        self,
        *,
        job_service: JobService | None = None,
        storage_service: StorageServiceInterface | None = None,
        management_service: JobManagementService | None = None,
        job_permissions: JobPermissions | None = None,
    ) -> None:
        self.job_service = job_service
        self.storage_service = storage_service
        self.management_service = management_service
        self.job_permissions = job_permissions

    async def list_jobs(
        self,
        *,
        current_user: Dict[str, Any],
        job_id: Optional[str],
        status: Optional[str],
        created_at_start: Optional[str],
        created_at_end: Optional[str],
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        job_service = self._job_service()
        cache_key = (
            f"jobs:{id(job_service)}:{current_user['id']}:{job_id}:{status}:"
            f"{created_at_start}:{created_at_end}:{limit}:{offset}"
        )

        async def fetch_jobs() -> Dict[str, Any]:
            start_iso, end_iso = _parse_created_at_filters(created_at_start, created_at_end)
            result = await job_service.get_jobs_with_filters(
                current_user=current_user,
                job_id=job_id,
                status=status,
                created_at_start=start_iso,
                created_at_end=end_iso,
                limit=limit,
                offset=offset,
            )
            return {"status": 200, **result}

        return await _jobs_cache.get_or_compute(cache_key, fetch_jobs)

    async def get_job_by_id(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        job_service = self._job_service()
        job = await job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        job["is_owned"] = job.get("user_id") == current_user["id"]
        job["user_permission"] = current_user.get("permission")
        job["shared_with_count"] = len(job.get("shared_with", []))
        await job_service.enrich_job_file_urls(job)
        return {"status": 200, "job": job}

    async def get_transcription_text(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
    ) -> str:
        job_service = self._job_service()
        storage_service = self._storage_service()
        job = await job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        if job.get("text_content"):
            return job["text_content"]

        transcription_url = job.get("transcription_file_path")
        if not transcription_url:
            raise ResourceNotReadyError(
                "Transcription not available for job",
                {"job_id": job_id, "job_status": job.get("status")},
            )

        text = await storage_service.download_text_from_blob(transcription_url)
        if text is None:
            raise ResourceNotFoundError("Transcription blob not available", transcription_url)
        return text

    async def get_analysis_document(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
        analysis_file_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        job_service = self._job_service()
        storage_service = self._storage_service()
        job = await job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        source_path = _resolve_analysis_path(job, analysis_file_path)
        if not source_path:
            raise ResourceNotReadyError(
                "Analysis not available for job",
                {"job_id": job_id, "job_status": job.get("status")},
            )

        extension = _path_extension(source_path)
        if extension in {".md", ".txt"}:
            text = await storage_service.download_text_from_blob(source_path)
            if text is None:
                raise ResourceNotFoundError("Analysis blob not available", _strip_url_query(source_path))
            content = await storage_service.generate_docx_bytes(text, add_title=False)
            return {
                "content": content,
                "filename": _download_filename(source_path, ".docx"),
                "media_type": DOCX_MEDIA_TYPE,
            }

        if extension == ".docx":
            try:
                content = await storage_service.download_blob_bytes(source_path)
            except FileNotFoundError as exc:
                raise ResourceNotFoundError("Analysis blob not available", _strip_url_query(source_path)) from exc
            return {
                "content": content,
                "filename": _download_filename(source_path, ".docx"),
                "media_type": DOCX_MEDIA_TYPE,
            }

        if extension == ".pdf":
            try:
                content = await storage_service.download_blob_bytes(source_path)
            except FileNotFoundError as exc:
                raise ResourceNotFoundError("Analysis blob not available", _strip_url_query(source_path)) from exc
            return {
                "content": content,
                "filename": _download_filename(source_path, ".pdf"),
                "media_type": PDF_MEDIA_TYPE,
            }

        raise ValidationError("Unsupported analysis document format")

    async def update_job_display_name(
        self,
        *,
        job_id: str,
        display_name: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        job_service = self._job_service()
        job = await job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, "edit"):
            raise PermissionError("Access denied to job")

        updated_job = await job_service.update_job_display_name(job_id, display_name)
        return {"status": 200, "job": updated_job}

    async def update_transcription_speaker_names(
        self,
        *,
        job_id: str,
        speaker_names: Dict[str, str],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        job_service = self._job_service()
        job = await job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, "edit"):
            raise PermissionError("Access denied to job")

        try:
            updated_text = await job_service.update_transcription_speaker_names(job, speaker_names)
        except ValueError as exc:
            raise ResourceNotReadyError(str(exc), {"job_id": job_id}) from exc

        return {"status": 200, "transcription": updated_text}

    async def soft_delete_job(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        management_service = self._management_service()
        job_permissions = self._job_permissions()
        user_id = current_user if isinstance(current_user, str) else current_user.get("id")
        is_admin = await job_permissions.check_user_admin_privileges(current_user)
        result = await management_service.soft_delete_job(job_id, user_id, is_admin=is_admin)
        _raise_for_management_error(result, default_message="Error deleting job")
        return {"status": "success", "message": f"Job {job_id} soft deleted", "job_id": job_id}

    async def restore_job(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        management_service = self._management_service()
        job_permissions = self._job_permissions()
        user_id = current_user if isinstance(current_user, str) else current_user.get("id")
        is_admin = await job_permissions.check_user_admin_privileges(current_user)
        result = await management_service.restore_job(job_id, user_id, is_admin=is_admin)
        _raise_for_management_error(result, default_message="Error restoring job")
        return {"status": "success", "message": f"Job {job_id} restored", "job_id": job_id}

    def _job_service(self) -> JobService:
        if self.job_service is None:
            raise RuntimeError("job_service is required")
        return self.job_service

    def _storage_service(self) -> StorageServiceInterface:
        if self.storage_service is None:
            raise RuntimeError("storage_service is required")
        return self.storage_service

    def _management_service(self) -> JobManagementService:
        if self.management_service is None:
            raise RuntimeError("management_service is required")
        return self.management_service

    def _job_permissions(self) -> JobPermissions:
        if self.job_permissions is None:
            raise RuntimeError("job_permissions is required")
        return self.job_permissions


def _parse_created_at_filters(
    created_at_start: Optional[str],
    created_at_end: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    start_iso = _parse_created_at_filter(created_at_start, end_of_day=False)
    end_iso = _parse_created_at_filter(created_at_end, end_of_day=True)
    if start_iso is not None and end_iso is not None and start_iso > end_iso:
        raise ValidationError("created_at_start must be <= created_at_end")
    return start_iso, end_iso


def _parse_created_at_filter(value: Optional[str], *, end_of_day: bool) -> Optional[str]:
    if not value:
        return None
    try:
        if len(value) == 10:
            parsed = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=UTC)
            if end_of_day:
                parsed = parsed + timedelta(days=1) - timedelta(milliseconds=1)
            return parsed.isoformat()

        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.isoformat()
    except ValueError as exc:
        raise ValidationError("Invalid date format for created_at_start or created_at_end") from exc


def _resolve_analysis_path(job: Dict[str, Any], requested_path: Optional[str]) -> Optional[str]:
    allowed_paths: dict[str, str] = {}

    def add_allowed(path: Optional[str]) -> None:
        if path:
            allowed_paths[_strip_url_query(path)] = path

    add_allowed(job.get("analysis_file_path"))
    attempts = job.get("analysis_attempts")
    if isinstance(attempts, list):
        for attempt in attempts:
            if isinstance(attempt, dict):
                add_allowed(attempt.get("analysis_file_path"))

    if requested_path:
        requested_key = _strip_url_query(requested_path)
        if requested_key not in allowed_paths:
            raise PermissionError("Access denied to analysis document")
        return allowed_paths[requested_key]

    if job.get("analysis_file_path"):
        return job["analysis_file_path"]

    if isinstance(attempts, list) and attempts:
        for attempt in reversed(attempts):
            if isinstance(attempt, dict) and attempt.get("analysis_file_path"):
                return attempt["analysis_file_path"]

    return None


def _strip_url_query(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return parsed._replace(query="", fragment="").geturl()
    return value.split("?", 1)[0].split("#", 1)[0]


def _path_extension(value: str) -> str:
    path = urlparse(value).path or value
    filename = path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if "." not in filename:
        return ""
    return f".{filename.rsplit('.', 1)[-1].lower()}"


def _download_filename(source_path: str, output_extension: str) -> str:
    path = urlparse(source_path).path or source_path
    filename = path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] or "analysis"
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{stem}{output_extension}"


def _raise_for_management_error(result: Dict[str, Any], *, default_message: str) -> None:
    if result.get("status") != "error":
        return
    message = result.get("message", default_message)
    if "not found" in message:
        raise ResourceNotFoundError("Job", str(result.get("job_id") or message))
    if "Access denied" in message:
        raise PermissionError(message)
    raise ValidationError(message)
