from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from starlette.datastructures import UploadFile

from app.api.v1.routes import uploads
from app.schemas.uploads import UploadCompleteRequest, UploadTokenRequest


@pytest.fixture
def current_user():
    return {"id": "user-123", "email": "user@example.com"}


@pytest.mark.asyncio
async def test_request_upload_token_calls_upload_workflow(current_user):
    upload_workflow = AsyncMock()
    upload_workflow.request_upload_token.return_value = {"filename": "file.wav"}
    body = UploadTokenRequest(filename="file.wav", file_size=10)

    result = await uploads.request_upload_token(
        body=body,
        current_user=current_user,
        upload_workflow=upload_workflow,
    )

    assert result == {"filename": "file.wav"}
    upload_workflow.request_upload_token.assert_awaited_once_with(
        filename="file.wav",
        file_size=10,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_complete_direct_upload_returns_created_job_response(current_user):
    upload_workflow = AsyncMock()
    upload_workflow.complete_direct_upload.return_value = {"id": "job-123", "status": "uploaded"}
    body = UploadCompleteRequest(
        blob_url="https://storage/recordings/file.wav",
        filename="file.wav",
        prompt_category_id="cat-1",
    )

    result = await uploads.complete_direct_upload(
        body=body,
        current_user=current_user,
        upload_workflow=upload_workflow,
    )

    assert result.status_code == 201
    assert result.headers["Location"] == "/api/v1/jobs/job-123"
    upload_workflow.complete_direct_upload.assert_awaited_once_with(
        blob_url="https://storage/recordings/file.wav",
        filename="file.wav",
        current_user=current_user,
        prompt_category_id="cat-1",
        prompt_subcategory_id=None,
        pre_session_form_data=None,
        audio_duration_seconds=None,
        audio_duration_minutes=None,
        recording_settings=None,
    )


@pytest.mark.asyncio
async def test_upload_job_file_returns_created_job_response(current_user):
    upload = UploadFile(filename="recording.wav", file=BytesIO(b"audio"))
    upload_workflow = AsyncMock()
    upload_workflow.upload_job_file.return_value = {"id": "job-123", "status": "uploaded"}

    result = await uploads.upload_job_file(
        file=upload,
        prompt_category_id=None,
        prompt_subcategory_id=None,
        pre_session_form_data=None,
        current_user=current_user,
        upload_workflow=upload_workflow,
    )

    assert result.status_code == 201
    assert result.headers["Location"] == "/api/v1/jobs/job-123"
    upload_workflow.upload_job_file.assert_awaited_once_with(
        file=upload,
        current_user=current_user,
        prompt_category_id=None,
        prompt_subcategory_id=None,
        pre_session_form_data=None,
    )
