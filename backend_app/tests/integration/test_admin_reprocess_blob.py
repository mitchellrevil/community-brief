"""Tests for admin blob reset/reprocess workflow."""

from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest

from app.core.errors.domain import ResourceNotFoundError, ValidationError
from app.repositories.jobs import JobRepository
from app.services.jobs.admin_job_reprocess_service import AdminJobReprocessService


def build_service(job=None, *, download_result=b"audio", upload_result=None):
    job_repository = MagicMock(spec=JobRepository)
    job_repository.get_by_id = AsyncMock(return_value=job)
    job_repository.replace = AsyncMock()

    storage = AsyncMock()
    storage.download_blob_bytes = AsyncMock(return_value=download_result)
    storage.upload_blob_bytes = AsyncMock(
        return_value=upload_result or "https://storage.blob.core.windows.net/uploads/new.mp3"
    )

    service = AdminJobReprocessService(
        storage_service=storage,
        job_repository=job_repository,
    )
    return service, job_repository, storage


def job_doc(job_id=None):
    return {
        "id": job_id or str(uuid.uuid4()),
        "type": "job",
        "user_id": "user-1",
        "file_name": "test.mp3",
        "file_path": "https://storage.blob.core.windows.net/uploads/test.mp3",
        "transcription_file_path": "https://storage.blob.core.windows.net/transcripts/transcript.txt",
        "analysis_file_path": "https://storage.blob.core.windows.net/analysis/analysis.docx",
        "analysis_attempts": [{"attempt": 1, "analysis_file_path": "..."}],
        "analysis_in_progress": True,
        "analysis_started_at": "2024-01-31T12:00:00Z",
        "analysis_completed_at": "2024-01-31T12:05:00Z",
        "error_message": "Previous error",
        "status": "error",
        "prompt_category_id": "cat-1",
        "prompt_subcategory_id": "subcat-1",
        "created_at": "2024-01-31T11:00:00Z",
    }


@pytest.mark.asyncio
async def test_reprocess_blob_resets_job_and_reuploads_blob():
    job_id = str(uuid.uuid4())
    job = job_doc(job_id)
    new_blob_url = "https://storage.blob.core.windows.net/uploads/test_new.mp3"
    service, repository, storage = build_service(job, upload_result=new_blob_url)

    result = await service.reprocess_blob(job_id, {"id": "admin-1", "permission": "Admin"})

    assert result["status"] == "success"
    assert result["job_id"] == job_id
    assert result["blob_url"] == new_blob_url
    assert "correlation_id" in result

    repository.get_by_id.assert_awaited_once_with(job_id)
    storage.download_blob_bytes.assert_awaited_once_with("https://storage.blob.core.windows.net/uploads/test.mp3")
    storage.upload_blob_bytes.assert_awaited_once_with("test.mp3", b"audio")
    repository.replace.assert_awaited_once()

    updated_job = repository.replace.await_args.args[1]
    assert updated_job["status"] == "uploaded"
    assert updated_job["file_path"] == new_blob_url
    assert updated_job["transcription_file_path"] is None
    assert updated_job["analysis_file_path"] is None
    assert updated_job["analysis_attempts"] == []
    assert updated_job["analysis_in_progress"] is False
    assert updated_job["analysis_started_at"] is None
    assert updated_job["analysis_completed_at"] is None
    assert updated_job["error_message"] is None
    assert updated_job["reset_by"] == "admin-1"
    assert updated_job["prompt_category_id"] == "cat-1"
    assert updated_job["prompt_subcategory_id"] == "subcat-1"
    assert updated_job["created_at"] == "2024-01-31T11:00:00Z"


@pytest.mark.asyncio
async def test_reprocess_blob_raises_when_job_missing():
    service, _, _ = build_service(None)

    with pytest.raises(ResourceNotFoundError):
        await service.reprocess_blob("missing", {"id": "admin-1"})


@pytest.mark.asyncio
async def test_reprocess_blob_raises_when_file_path_missing():
    job = job_doc()
    job["file_path"] = None
    service, _, _ = build_service(job)

    with pytest.raises(ValidationError):
        await service.reprocess_blob(job["id"], {"id": "admin-1"})


@pytest.mark.asyncio
async def test_reprocess_blob_raises_validation_when_original_blob_missing():
    job = job_doc()
    service, _, storage = build_service(job)
    storage.download_blob_bytes.side_effect = FileNotFoundError("Blob not found")

    with pytest.raises(ValidationError):
        await service.reprocess_blob(job["id"], {"id": "admin-1"})


@pytest.mark.asyncio
async def test_reprocess_blob_route_delegates_to_service():
    from app.api.v1.routes.admin_jobs import reprocess_blob

    reprocess_service = AsyncMock()
    reprocess_service.reprocess_blob = AsyncMock(
        return_value={
            "status": "success",
            "job_id": "job-1",
            "blob_url": "https://storage/new.mp3",
            "correlation_id": str(uuid.uuid4()),
        }
    )

    result = await reprocess_blob(
        job_id="job-1",
        current_user={"id": "admin-1", "permission": "Admin"},
        reprocess_service=reprocess_service,
    )

    assert result["status"] == "success"
    reprocess_service.reprocess_blob.assert_awaited_once_with(
        "job-1",
        {"id": "admin-1", "permission": "Admin"},
    )
