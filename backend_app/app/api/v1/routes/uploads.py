from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from ....core.auth import get_current_user
from ....core.rate_limit import upload_limit
from ....deps import get_upload_workflow_service
from ....schemas.uploads import UploadCompleteRequest, UploadTokenRequest
from ....services.uploads.upload_workflow_service import UploadWorkflowService


router = APIRouter(prefix="/upload", tags=["upload"], dependencies=[Depends(upload_limit)])


def _created_job_response(created_job: dict[str, Any]) -> JSONResponse:
    return JSONResponse(
        status_code=201,
        content=created_job,
        headers={"Location": f"/api/v1/jobs/{created_job['id']}"},
    )


@router.post("/request-token")
async def request_upload_token(
    body: UploadTokenRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    upload_workflow: UploadWorkflowService = Depends(get_upload_workflow_service),
) -> dict[str, Any]:
    return await upload_workflow.request_upload_token(
        filename=body.filename,
        file_size=body.file_size,
        current_user=current_user,
    )


@router.post("/complete")
async def complete_direct_upload(
    body: UploadCompleteRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    upload_workflow: UploadWorkflowService = Depends(get_upload_workflow_service),
):
    created_job = await upload_workflow.complete_direct_upload(
        blob_url=body.blob_url,
        filename=body.filename,
        current_user=current_user,
        prompt_category_id=body.prompt_category_id,
        prompt_subcategory_id=body.prompt_subcategory_id,
        pre_session_form_data=body.pre_session_form_data,
        audio_duration_seconds=body.audio_duration_seconds,
        audio_duration_minutes=body.audio_duration_minutes,
        recording_settings=body.recording_settings,
    )
    return _created_job_response(created_job)


@router.post("/job")
async def upload_job_file(
    file: UploadFile = File(...),
    prompt_category_id: Optional[str] = Form(None),
    prompt_subcategory_id: Optional[str] = Form(None),
    pre_session_form_data: Optional[str] = Form(None),
    current_user: dict[str, Any] = Depends(get_current_user),
    upload_workflow: UploadWorkflowService = Depends(get_upload_workflow_service),
):
    created_job = await upload_workflow.upload_job_file(
        file=file,
        current_user=current_user,
        prompt_category_id=prompt_category_id,
        prompt_subcategory_id=prompt_subcategory_id,
        pre_session_form_data=pre_session_form_data,
    )
    return _created_job_response(created_job)
