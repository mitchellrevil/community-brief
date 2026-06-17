import asyncio
import os
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from starlette.datastructures import UploadFile

from app.core.errors.domain import ApplicationError
from app.services.jobs.job_upload_service import JobUploadService
from app.utils.file_utils import FileUtils


def _upload(filename: str = "recording.txt", content: bytes = b"hello") -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


@pytest.fixture
def current_user():
    return {"id": "user-123", "email": "user@example.com"}


@pytest.fixture
def job_service():
    return AsyncMock()


@pytest.fixture
def analytics_service():
    return AsyncMock()


@pytest.fixture
def prompt_service():
    return AsyncMock()


@pytest.mark.asyncio
async def test_create_job_from_upload_saves_file_creates_job_and_tracks_analytics(
    current_user,
    job_service,
    analytics_service,
    prompt_service,
):
    captured_path = None

    async def upload_and_create_job(file_path, original_filename, owner_user, metadata):
        nonlocal captured_path
        captured_path = file_path
        assert os.path.exists(file_path)
        assert original_filename == "recording.txt"
        assert owner_user == current_user
        assert metadata["prompt_category_id"] == "cat-1"
        assert metadata["pre_session_form_data"] == {"client": "web"}
        return {
            "id": "job-123",
            "status": "uploaded",
            "prompt_category_id": metadata["prompt_category_id"],
        }

    job_service.upload_and_create_job.side_effect = upload_and_create_job
    service = JobUploadService(job_service, analytics_service, prompt_service)

    result = await service.create_job_from_upload(
        file=_upload(),
        current_user=current_user,
        prompt_category_id="cat-1",
        pre_session_form_data='{"client":"web"}',
    )

    await asyncio.sleep(0.01)
    assert result["id"] == "job-123"
    assert captured_path is not None
    assert not os.path.exists(captured_path)
    analytics_service.track_job_event.assert_awaited_once()
    _, kwargs = analytics_service.track_job_event.await_args
    assert kwargs["job_id"] == "job-123"
    assert kwargs["user_id"] == current_user["id"]
    assert kwargs["event_type"] == "job_created"
    assert kwargs["metadata"]["file_name"] == "recording.txt"
    assert kwargs["metadata"]["prompt_category_id"] == "cat-1"


@pytest.mark.asyncio
async def test_create_job_from_upload_rejects_large_file(
    monkeypatch,
    current_user,
    job_service,
    analytics_service,
    prompt_service,
):
    def raise_too_large(upload_file, dest_path, max_bytes):
        raise FileUtils.UploadTooLargeError("too big")

    monkeypatch.setattr(FileUtils, "save_upload_to_temp", staticmethod(raise_too_large))
    service = JobUploadService(job_service, analytics_service, prompt_service)

    with pytest.raises(ApplicationError) as exc:
        await service.create_job_from_upload(file=_upload(), current_user=current_user)

    assert exc.value.status_code == 413
    job_service.upload_and_create_job.assert_not_called()


@pytest.mark.asyncio
async def test_create_job_from_upload_rejects_prompt_category_mismatch(
    current_user,
    job_service,
    analytics_service,
    prompt_service,
):
    prompt_service.get_subcategory.return_value = {
        "id": "sub-1",
        "category_id": "cat-actual",
        "prompt_visibility": "all",
    }
    service = JobUploadService(job_service, analytics_service, prompt_service)

    with pytest.raises(ApplicationError) as exc:
        await service.create_job_from_upload(
            file=_upload(),
            current_user=current_user,
            prompt_category_id="cat-requested",
            prompt_subcategory_id="sub-1",
        )

    assert exc.value.status_code == 400
    prompt_service.get_subcategory.assert_awaited_once_with("sub-1")
    job_service.upload_and_create_job.assert_not_called()


@pytest.mark.asyncio
async def test_create_job_from_upload_does_not_fail_when_analytics_runtime_error_occurs(
    current_user,
    job_service,
    analytics_service,
    prompt_service,
):
    job_service.upload_and_create_job.return_value = {"id": "job-123", "status": "uploaded"}
    analytics_service.track_job_event.side_effect = RuntimeError("analytics unavailable")
    service = JobUploadService(job_service, analytics_service, prompt_service)

    result = await service.create_job_from_upload(
        file=_upload(),
        current_user=current_user,
    )

    await asyncio.sleep(0.01)
    assert result["id"] == "job-123"
