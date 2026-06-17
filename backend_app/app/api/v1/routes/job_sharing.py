from typing import Any

from fastapi import APIRouter, Depends

from ....core.auth import get_current_user
from ....core.rate_limit import standard_rate_limit
from ....deps import get_job_sharing_workflow_service
from ....schemas.job_sharing import JobShareResponse, ShareJobRequest
from ....services.jobs.job_sharing_workflow_service import JobSharingWorkflowService


router = APIRouter(prefix="/jobs", tags=["job-sharing"], dependencies=[Depends(standard_rate_limit)])


@router.post("/{job_id}/share", response_model=JobShareResponse)
async def share_job(
    job_id: str,
    share_request: ShareJobRequest,
    current_user: Any = Depends(get_current_user),
    workflow_service: JobSharingWorkflowService = Depends(get_job_sharing_workflow_service),
) -> JobShareResponse:
    return await workflow_service.share_job(
        job_id=job_id,
        share_request=share_request,
        current_user=current_user,
    )


@router.delete("/{job_id}/share/{shared_user_email}")
async def unshare_job(
    job_id: str,
    shared_user_email: str,
    current_user: Any = Depends(get_current_user),
    workflow_service: JobSharingWorkflowService = Depends(get_job_sharing_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.unshare_job(
        job_id=job_id,
        shared_user_email=shared_user_email,
        current_user=current_user,
    )


@router.get("/{job_id}/sharing")
async def get_job_sharing_info(
    job_id: str,
    current_user: Any = Depends(get_current_user),
    workflow_service: JobSharingWorkflowService = Depends(get_job_sharing_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.get_job_sharing_info(
        job_id=job_id,
        current_user=current_user,
    )


@router.get("/shared")
async def get_shared_jobs(
    current_user: Any = Depends(get_current_user),
    workflow_service: JobSharingWorkflowService = Depends(get_job_sharing_workflow_service),
) -> dict[str, Any]:
    return await workflow_service.get_shared_jobs(current_user=current_user)
