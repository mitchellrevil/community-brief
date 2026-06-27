import asyncio
import os
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.datastructures import UploadFile

from app.core.errors.domain import ApplicationError
from app.services.uploads.upload_workflow_service import MAX_FILE_SIZE_BYTES, UploadWorkflowService


def _upload(filename: str = "recording.wav", content: bytes = b"RIFF" + b"\x00" * 128) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


async def _blob_chunks(*chunks: bytes):
    for chunk in chunks:
        yield chunk


def _service(
    *,
    storage_service=None,
    job_service=None,
    analytics_service=None,
    prompt_service=None,
) -> UploadWorkflowService:
    return UploadWorkflowService(
        storage_service=storage_service or AsyncMock(),
        job_service=job_service or AsyncMock(),
        analytics_service=analytics_service or AsyncMock(),
        prompt_service=prompt_service or AsyncMock(),
        upload_semaphore=asyncio.Semaphore(1),
    )


@pytest.mark.asyncio
async def test_request_upload_token_sanitizes_filename_and_returns_sas_info():
    storage_service = AsyncMock()
    storage_service.generate_upload_sas.return_value = {
        "sas_url": "https://storage/upload.wav?sas",
        "blob_url": "https://storage/upload.wav",
        "blob_name": "2026-01-01/upload.wav",
        "container": "recordings",
        "expiry": "2026-01-01T01:00:00Z",
    }
    service = _service(storage_service=storage_service)

    result = await service.request_upload_token(
        filename="../upload.wav",
        file_size=10,
        current_user={"id": "user-123"},
    )

    storage_service.generate_upload_sas.assert_awaited_once_with("upload.wav", "user-123")
    assert result["filename"] == "upload.wav"
    assert result["sas_url"].endswith("?sas")


@pytest.mark.asyncio
async def test_complete_direct_upload_creates_job_and_tracks_analytics():
    storage_service = AsyncMock()
    storage_service.is_expected_direct_upload_blob = MagicMock(return_value=True)
    storage_service.verify_blob_exists.return_value = 500
    storage_service.stream_blob_content = MagicMock(
        return_value=_blob_chunks(b"RIFF", b"\x00" * 128)
    )
    job_service = AsyncMock()
    job_service.create_job_from_blob.return_value = {
        "id": "job-123",
        "status": "uploaded",
        "audio_duration_seconds": 120.0,
        "audio_duration_minutes": 2.0,
        "file_size_bytes": 500,
    }
    analytics_service = AsyncMock()
    service = _service(
        storage_service=storage_service,
        job_service=job_service,
        analytics_service=analytics_service,
    )

    result = await service.complete_direct_upload(
        blob_url="https://storage/recordings/file.wav",
        filename="file.wav",
        current_user={"id": "user-123"},
        prompt_category_id="cat-1",
        prompt_subcategory_id=None,
        pre_session_form_data={"field": "value"},
        audio_duration_seconds=120.0,
        audio_duration_minutes=None,
        recording_settings={"source": "browser"},
    )

    await asyncio.sleep(0.01)
    assert result["id"] == "job-123"
    _, create_kwargs = job_service.create_job_from_blob.await_args
    assert create_kwargs["metadata"]["audio_duration_minutes"] == 2.0
    assert create_kwargs["metadata"]["recording_settings"] == {"source": "browser"}
    _, analytics_kwargs = analytics_service.track_job_event.await_args
    assert analytics_kwargs["metadata"]["upload_method"] == "direct"
    assert analytics_kwargs["metadata"]["file_size_bytes"] == 500


@pytest.mark.asyncio
async def test_complete_direct_upload_rejects_unbound_blob_url():
    storage_service = AsyncMock()
    storage_service.is_expected_direct_upload_blob = MagicMock(return_value=False)
    job_service = AsyncMock()
    service = _service(storage_service=storage_service, job_service=job_service)

    with pytest.raises(ApplicationError) as exc:
        await service.complete_direct_upload(
            blob_url="https://storage/recordings/other-user/file.wav",
            filename="file.wav",
            current_user={"id": "user-123"},
            prompt_category_id=None,
            prompt_subcategory_id=None,
            pre_session_form_data=None,
            audio_duration_seconds=None,
            audio_duration_minutes=None,
            recording_settings=None,
        )

    assert exc.value.status_code == 400
    job_service.create_job_from_blob.assert_not_called()


@pytest.mark.asyncio
async def test_complete_direct_upload_rejects_oversize_blob():
    storage_service = AsyncMock()
    storage_service.is_expected_direct_upload_blob = MagicMock(return_value=True)
    storage_service.verify_blob_exists.return_value = MAX_FILE_SIZE_BYTES + 1
    job_service = AsyncMock()
    service = _service(storage_service=storage_service, job_service=job_service)

    with pytest.raises(ApplicationError) as exc:
        await service.complete_direct_upload(
            blob_url="https://storage/recordings/direct/user-123/file.wav",
            filename="file.wav",
            current_user={"id": "user-123"},
            prompt_category_id=None,
            prompt_subcategory_id=None,
            pre_session_form_data=None,
            audio_duration_seconds=None,
            audio_duration_minutes=None,
            recording_settings=None,
        )

    assert exc.value.status_code == 413
    job_service.create_job_from_blob.assert_not_called()


@pytest.mark.asyncio
async def test_upload_job_file_saves_temp_file_creates_job_and_cleans_up():
    captured_path = None

    job_service = AsyncMock()

    async def upload_and_create_job(file_path, original_filename, owner_user, metadata):
        nonlocal captured_path
        captured_path = file_path
        assert os.path.exists(file_path)
        assert original_filename == "recording.wav"
        assert metadata["pre_session_form_data"] == {"field": "value"}
        return {"id": "job-123", "status": "uploaded"}

    job_service.upload_and_create_job.side_effect = upload_and_create_job
    analytics_service = AsyncMock()
    service = _service(job_service=job_service, analytics_service=analytics_service)

    result = await service.upload_job_file(
        file=_upload(),
        current_user={"id": "user-123"},
        prompt_category_id=None,
        prompt_subcategory_id=None,
        pre_session_form_data='{"field":"value"}',
    )

    await asyncio.sleep(0.01)
    assert result["id"] == "job-123"
    assert captured_path is not None
    assert not os.path.exists(captured_path)
    _, analytics_kwargs = analytics_service.track_job_event.await_args
    assert analytics_kwargs["metadata"]["upload_method"] == "multipart"
    assert analytics_kwargs["metadata"]["file_name"] == "recording.wav"


@pytest.mark.asyncio
async def test_upload_job_file_rejects_non_audio_content():
    job_service = AsyncMock()
    service = _service(job_service=job_service)

    with pytest.raises(ApplicationError) as exc:
        await service.upload_job_file(
            file=_upload(filename="recording.wav", content=b"plain text"),
            current_user={"id": "user-123"},
            prompt_category_id=None,
            prompt_subcategory_id=None,
            pre_session_form_data=None,
        )

    assert exc.value.status_code == 400
    job_service.upload_and_create_job.assert_not_called()


@pytest.mark.asyncio
async def test_upload_job_file_does_not_fail_when_analytics_runtime_error_occurs():
    job_service = AsyncMock()
    job_service.upload_and_create_job.return_value = {"id": "job-123", "status": "uploaded"}
    analytics_service = AsyncMock()
    analytics_service.track_job_event.side_effect = RuntimeError("analytics unavailable")
    service = _service(job_service=job_service, analytics_service=analytics_service)

    result = await service.upload_job_file(
        file=_upload(),
        current_user={"id": "user-123"},
        prompt_category_id=None,
        prompt_subcategory_id=None,
        pre_session_form_data=None,
    )

    assert result["id"] == "job-123"
