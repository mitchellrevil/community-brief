from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from ....core.auth import get_current_user
from ....core.rate_limit import standard_rate_limit, upload_limit
from ....deps import (
    get_job_management_service,
    get_job_permissions,
    get_job_service,
    get_job_upload_service,
    get_storage_service,
)
from ....schemas.jobs import JobUpdateRequest, SpeakerNamesUpdateRequest
from ....services.jobs.job_service import JobService
from ....services.jobs.job_permissions import JobPermissions
from ....services.jobs.job_management_service import JobManagementService
from ....services.jobs.job_route_workflow_service import JobRouteWorkflowService
from ....services.jobs.job_upload_service import JobUploadService
from ....services.interfaces import StorageServiceInterface

router = APIRouter(prefix="", tags=["jobs"], dependencies=[Depends(standard_rate_limit)])


@router.get("/jobs")
async def get_jobs(
    job_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    created_at_start: Optional[str] = Query(
        None,
        description="Filter jobs with created_at on or after this date (YYYY-MM-DD or ISO string)",
    ),
    created_at_end: Optional[str] = Query(
        None,
        description="Filter jobs with created_at on or before this date (YYYY-MM-DD or ISO string)",
    ),
    limit: int = Query(12, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_svc: JobService = Depends(get_job_service),
) -> Dict[str, Any]:
    return await JobRouteWorkflowService(job_service=job_svc).list_jobs(
        current_user=current_user,
        job_id=job_id,
        status=status,
        created_at_start=created_at_start,
        created_at_end=created_at_end,
        limit=limit,
        offset=offset,
    )


@router.get("/jobs/{job_id}")
async def get_job_by_id(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_svc: JobService = Depends(get_job_service),
) -> Dict[str, Any]:
    return await JobRouteWorkflowService(job_service=job_svc).get_job_by_id(
        job_id=job_id,
        current_user=current_user,
    )


@router.get("/jobs/{job_id}/transcription")
async def get_job_transcription(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_svc: JobService = Depends(get_job_service),
    storage_service: StorageServiceInterface = Depends(get_storage_service),
):
    text = await JobRouteWorkflowService(
        job_service=job_svc,
        storage_service=storage_service,
    ).get_transcription_text(
        job_id=job_id,
        current_user=current_user,
    )

    def stream_text():
        yield text.encode("utf-8")

    return StreamingResponse(stream_text(), media_type="text/plain")


@router.patch("/jobs/{job_id}/transcription/speakers")
async def update_job_transcription_speakers(
    job_id: str,
    update_request: SpeakerNamesUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_svc: JobService = Depends(get_job_service),
):
    return await JobRouteWorkflowService(job_service=job_svc).update_transcription_speaker_names(
        job_id=job_id,
        speaker_names=update_request.speaker_names,
        current_user=current_user,
    )


@router.post("/jobs", dependencies=[Depends(upload_limit)])
async def create_job(
    file: UploadFile = File(...),
    prompt_category_id: Optional[str] = Form(None),
    prompt_subcategory_id: Optional[str] = Form(None),
    pre_session_form_data: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_upload_service: JobUploadService = Depends(get_job_upload_service),
):
    created_job = await job_upload_service.create_job_from_upload(
        file=file,
        current_user=current_user,
        prompt_category_id=prompt_category_id,
        prompt_subcategory_id=prompt_subcategory_id,
        pre_session_form_data=pre_session_form_data,
    )
    return JSONResponse(
        status_code=201,
        content=created_job,
        headers={"Location": f"/api/v1/jobs/{created_job['id']}"},
    )


@router.patch("/jobs/{job_id}")
async def update_job(
    job_id: str,
    update_request: JobUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    job_svc: JobService = Depends(get_job_service),
):
    return await JobRouteWorkflowService(job_service=job_svc).update_job_display_name(
        job_id=job_id,
        display_name=update_request.displayname,
        current_user=current_user,
    )


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    management_service: JobManagementService = Depends(get_job_management_service),
    job_permissions: JobPermissions = Depends(get_job_permissions),
):
    return await JobRouteWorkflowService(
        management_service=management_service,
        job_permissions=job_permissions,
    ).soft_delete_job(job_id=job_id, current_user=current_user)


@router.post("/jobs/{job_id}/restore")
async def restore_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    management_service: JobManagementService = Depends(get_job_management_service),
    job_permissions: JobPermissions = Depends(get_job_permissions),
):
    return await JobRouteWorkflowService(
        management_service=management_service,
        job_permissions=job_permissions,
    ).restore_job(job_id=job_id, current_user=current_user)

