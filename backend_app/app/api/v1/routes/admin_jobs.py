"""Admin job routes."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from ....core.auth import require_admin
from ....core.errors.domain import PermissionError, ResourceNotFoundError, ValidationError
from ....core.rate_limit import admin_mutation_limit
from ....deps import get_admin_job_reprocess_service, get_job_management_service
from ....services.jobs.admin_job_reprocess_service import AdminJobReprocessService
from ....services.jobs.job_management_service import JobManagementService

router = APIRouter(
    prefix="/admin/jobs",
    tags=["job-admin"],
    dependencies=[Depends(admin_mutation_limit)],
)


def _current_user_id(current_user: dict[str, Any] | str) -> str:
    return current_user.get("id") if isinstance(current_user, dict) else current_user


def _raise_for_job_result(result: dict[str, Any], job_id: str) -> None:
    if result["status"] != "error":
        return

    message = result.get("message", "")
    if "not found" in message.lower():
        raise ResourceNotFoundError("job", job_id)
    if "Access denied" in message:
        raise PermissionError(message)
    raise ValidationError(message)


def _job_statistics_response() -> dict[str, Any]:
    return {
        "status": "success",
        "stats": {
            "total_jobs": 0,
            "active_jobs": 0,
            "deleted_jobs": 0,
            "shared_jobs": 0,
            "processing_jobs": 0,
        },
        "message": "Job statistics endpoint - implementation pending",
    }


@router.put("/{job_id}/restore")
async def restore_job(
    job_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
) -> dict[str, Any]:
    user_id = _current_user_id(current_user)
    result = await management_service.restore_job(job_id, user_id, is_admin=True)
    _raise_for_job_result(result, job_id)
    return {"status": "success", "message": f"Job {job_id} restored successfully", "job_id": job_id}


@router.delete("/{job_id}/permanent")
async def permanent_delete_job(
    job_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
) -> dict[str, Any]:
    user_id = _current_user_id(current_user)
    result = await management_service.permanent_delete_job(job_id, user_id, is_admin=True)
    _raise_for_job_result(result, job_id)
    return {"status": "success", "message": f"Job {job_id} permanently deleted", "job_id": job_id}


@router.get("")
async def get_all_jobs(
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
    limit: int = Query(50, description="Maximum number of jobs to return"),
    offset: int = Query(0, description="Number of jobs to skip"),
    include_deleted: bool = Query(False, description="Include soft-deleted jobs"),
    user_id: Optional[str] = Query(None, description="Filter by specific user ID"),
) -> dict[str, Any]:
    result = await management_service.get_all_jobs(
        limit=limit,
        offset=offset,
        include_deleted=include_deleted,
        filter_user_id=user_id,
    )
    if result.get("error"):
        raise ValidationError(result.get("error"))
    return {
        "status": "success",
        "jobs": result.get("jobs", []),
        "total_count": result.get("total_count", 0),
        "limit": limit,
        "offset": offset,
        "include_deleted": include_deleted,
        "user_id": user_id,
    }


@router.get("/deleted")
async def get_deleted_jobs(
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
    limit: int = Query(50, description="Maximum number of jobs to return"),
    offset: int = Query(0, description="Number of jobs to skip"),
    user_id: Optional[str] = Query(None, description="Filter by specific user ID"),
) -> dict[str, Any]:
    admin_user_id = _current_user_id(current_user)
    result = await management_service.get_deleted_jobs(
        admin_user_id,
        limit=limit,
        offset=offset,
        is_admin=True,
        filter_user_id=user_id,
    )
    if result.get("status") == "error":
        message = result.get("message", "")
        if "Access denied" in message:
            raise PermissionError(message)
        raise ValidationError(message)
    return {
        "status": "success",
        "deleted_jobs": result.get("deleted_jobs", []),
        "total_count": result.get("total_count", 0),
        "limit": limit,
        "offset": offset,
        "user_id": user_id,
    }


@router.post("/{job_id}/reprocess")
async def trigger_analysis_processing(
    job_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
) -> dict[str, Any]:
    user_id = _current_user_id(current_user)
    result = await management_service.trigger_analysis_processing(job_id, user_id, is_admin=True)
    _raise_for_job_result(result, job_id)
    return {
        "status": "success",
        "message": f"Analysis processing triggered for job {job_id}",
        "job_id": job_id,
        "processing_id": result.get("processing_id"),
    }


@router.post("/{job_id}/reprocess-blob")
async def reprocess_blob(
    job_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    reprocess_service: AdminJobReprocessService = Depends(get_admin_job_reprocess_service),
) -> dict[str, Any]:
    return await reprocess_service.reprocess_blob(job_id, current_user)


@router.get("/user/{user_id}")
async def get_user_jobs(
    user_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    management_service: JobManagementService = Depends(get_job_management_service),
    limit: int = Query(50, description="Maximum number of jobs to return"),
    offset: int = Query(0, description="Number of jobs to skip"),
    include_deleted: bool = Query(False, description="Include soft-deleted jobs"),
) -> dict[str, Any]:
    result = await management_service.get_my_jobs(
        user_id=user_id,
        limit=limit,
        offset=offset,
        include_deleted=include_deleted,
    )
    if result.get("status") == "error":
        raise ValidationError(result.get("message", "Unknown error"))
    return {
        "status": "success",
        "user_id": user_id,
        "jobs": result.get("jobs", []),
        "total_count": result.get("total_count", 0),
        "limit": limit,
        "offset": offset,
        "include_deleted": include_deleted,
    }


@router.get("/stats")
async def get_job_statistics(
    current_user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    return _job_statistics_response()
