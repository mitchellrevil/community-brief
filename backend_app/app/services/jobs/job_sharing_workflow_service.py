"""HTTP-adjacent job sharing workflows owned outside the route module."""
from __future__ import annotations

from typing import Any, Dict

from ...core.errors.domain import ApplicationError, ErrorCode, PermissionError, ResourceNotFoundError
from ...schemas.job_sharing import JobShareResponse, ShareJobRequest
from .job_permissions import JobPermissions
from .job_service import JobService
from .job_sharing_service import JobSharingService


class JobSharingWorkflowService:
    def __init__(
        self,
        *,
        sharing_service: JobSharingService,
        job_service: JobService,
        permissions: JobPermissions,
    ) -> None:
        self.sharing_service = sharing_service
        self.job_service = job_service
        self.permissions = permissions

    async def share_job(
        self,
        *,
        job_id: str,
        share_request: ShareJobRequest,
        current_user: Any,
    ) -> JobShareResponse:
        user_id = _current_user_id(current_user)
        await self._require_accessible_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="admin",
            denied_message="You don't have permission to share this job",
        )

        result = await self.sharing_service.share_job(
            job_id=job_id,
            owner_user_id=user_id,
            target_user_email=share_request.shared_user_email,
            permission_level=share_request.permission_level,
            message=share_request.message,
        )
        if result["status"] == "error":
            _raise_share_service_error(
                message=result.get("message", "Unable to share job"),
                job_id=job_id,
                target_email=share_request.shared_user_email,
                permission_level=share_request.permission_level,
            )

        return JobShareResponse(
            status="success",
            message=f"Job shared successfully with {share_request.shared_user_email}",
            sharing_id=result.get("sharing_id"),
            permission_level=share_request.permission_level,
        )

    async def unshare_job(
        self,
        *,
        job_id: str,
        shared_user_email: str,
        current_user: Any,
    ) -> Dict[str, Any]:
        user_id = _current_user_id(current_user)
        await self._require_accessible_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="admin",
            denied_message="You don't have permission to manage sharing for this job",
        )

        result = await self.sharing_service.unshare_job(
            job_id=job_id,
            owner_user_id=user_id,
            target_user_email=shared_user_email,
        )
        if result["status"] == "error":
            message = result.get("message", "Unable to unshare job")
            details = {"job_id": job_id, "target_email": shared_user_email}
            if "not found" in message.lower():
                raise ResourceNotFoundError("Job share", shared_user_email, details)
            raise ApplicationError(message, ErrorCode.INVALID_INPUT, status_code=400, details=details)

        return {
            "status": "success",
            "message": f"Sharing removed for {shared_user_email}",
        }

    async def get_job_sharing_info(
        self,
        *,
        job_id: str,
        current_user: Any,
    ) -> Dict[str, Any]:
        user_id = _current_user_id(current_user)
        await self._require_accessible_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="view",
            denied_message="You don't have permission to view this job",
        )

        result = await self.sharing_service.get_job_sharing_info(job_id, current_user)
        if isinstance(result, dict) and result.get("status") == "error":
            message = result.get("message", "Unable to fetch job sharing info")
            details = {"job_id": job_id, "user_id": user_id}
            if "not found" in message.lower():
                raise ResourceNotFoundError("Job", job_id, details)
            raise ApplicationError(message, ErrorCode.INVALID_INPUT, status_code=400, details=details)

        sharing_info = result.get("sharing_info") if isinstance(result, dict) else {}
        shared_with = sharing_info.get("shared_with") if isinstance(sharing_info, dict) else []
        total_shares = sharing_info.get("shared_with_count") if isinstance(sharing_info, dict) else 0
        is_owner = sharing_info.get("is_owner") if isinstance(sharing_info, dict) else False

        user_permission = "admin" if is_owner else "view"
        if not is_owner and isinstance(shared_with, list):
            user_share = next((share for share in shared_with if share.get("user_id") == user_id), None)
            if user_share:
                user_permission = user_share.get("permission_level", "view")

        return {
            "status": "success",
            "job_id": job_id,
            "is_owner": is_owner,
            "user_permission": user_permission,
            "shared_with": shared_with or [],
            "total_shares": total_shares or 0,
        }

    async def get_shared_jobs(self, *, current_user: Any) -> Dict[str, Any]:
        user_id = _current_user_id(current_user)
        result = await self.sharing_service.get_shared_jobs(user_id)
        if not isinstance(result, dict):
            raise ApplicationError(
                "Unexpected response from sharing service",
                ErrorCode.INTERNAL_ERROR,
                status_code=500,
                details={"user_id": user_id, "response_type": type(result).__name__},
            )

        shared_jobs = result.get("shared_jobs", [])
        owned_jobs = result.get("owned_jobs_shared_with_others", [])
        return {
            "status": "success",
            "shared_jobs": shared_jobs,
            "owned_jobs_shared_with_others": owned_jobs,
            "message": (
                f"Found {len(shared_jobs)} jobs shared with you and "
                f"{len(owned_jobs)} of your jobs shared with others"
            ),
        }

    async def _require_accessible_job(
        self,
        *,
        job_id: str,
        current_user: Any,
        required_permission: str,
        denied_message: str,
    ) -> Dict[str, Any]:
        job = await self.job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)

        has_access = await self.permissions.check_job_access(job, current_user, required_permission)
        if not has_access:
            raise PermissionError(
                denied_message,
                details={"job_id": job_id, "user_id": _current_user_id(current_user)},
            )

        return job


def _current_user_id(current_user: Any) -> str:
    return current_user if isinstance(current_user, str) else current_user.get("id")


def _raise_share_service_error(
    *,
    message: str,
    job_id: str,
    target_email: str,
    permission_level: str,
) -> None:
    details = {
        "job_id": job_id,
        "target_email": target_email,
        "permission_level": permission_level,
    }
    lowered = message.lower()
    if "not found" in lowered:
        raise ResourceNotFoundError("Job share target", target_email, details)
    if "already shared" in lowered:
        raise ApplicationError(message, ErrorCode.RESOURCE_CONFLICT, status_code=409, details=details)
    raise ApplicationError(message, ErrorCode.INVALID_INPUT, status_code=400, details=details)
