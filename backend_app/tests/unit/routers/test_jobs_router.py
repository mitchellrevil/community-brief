"""
Unit tests for jobs router endpoints.
Tests all CRUD operations, filtering, and error handling for job management.
Calls router functions directly with mocked dependencies, matching the admin job route tests.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import UTC, datetime

from app.api.v1.routes import jobs as jobs_router
from app.core.errors.domain import (
    PermissionError,
    ResourceNotFoundError,
    ResourceNotReadyError,
    ValidationError,
)


@pytest.fixture
def mock_current_user():
    """Mock current user."""
    return {"id": "user-123", "email": "test@example.com"}


@pytest.fixture
def mock_job():
    """Mock job object."""
    return {
        "id": "job-123",
        "user_id": "user-123",
        "displayname": "Test Job",
        "status": "uploaded",
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
        "text_content": None,
        "transcription_file_path": None,
        "shared_with": [],
    }


@pytest.fixture
def mock_error_handler():
    """Mock error handler."""
    mh = MagicMock()
    mh.raise_internal = MagicMock()
    return mh


class TestGetJobs:
    """Tests for get_jobs endpoint."""

    @pytest.mark.asyncio
    async def test_get_jobs_success(self, mock_current_user, mock_job, mock_error_handler):
        """Test successful job listing."""
        job_svc = AsyncMock()
        job_svc.get_jobs_with_filters.return_value = {
            "jobs": [mock_job],
            "total": 1,
            "limit": 12,
            "offset": 0,
        }

        result = await jobs_router.get_jobs(
            job_id=None,
            status=None,
            created_at_start=None,
            created_at_end=None,
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200
        assert len(result["jobs"]) == 1

    @pytest.mark.asyncio
    async def test_get_jobs_with_status_filter(self, mock_current_user, mock_job, mock_error_handler):
        """Test job listing with status filter."""
        job_svc = AsyncMock()
        job_svc.get_jobs_with_filters.return_value = {
            "jobs": [mock_job],
            "total": 1,
            "limit": 12,
            "offset": 0,
        }

        result = await jobs_router.get_jobs(
            job_id=None,
            status="completed",
            created_at_start=None,
            created_at_end=None,
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200
        job_svc.get_jobs_with_filters.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_jobs_with_date_filters(self, mock_current_user, mock_job, mock_error_handler):
        """Test job listing with date filters."""
        job_svc = AsyncMock()
        job_svc.get_jobs_with_filters.return_value = {
            "jobs": [mock_job],
            "total": 1,
            "limit": 12,
            "offset": 0,
        }

        result = await jobs_router.get_jobs(
            job_id=None,
            status=None,
            created_at_start="2025-01-01",
            created_at_end="2025-12-31",
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200

    @pytest.mark.asyncio
    async def test_get_jobs_pagination(self, mock_current_user, mock_error_handler):
        """Test job listing with pagination offset."""
        job_svc = AsyncMock()
        job_svc.get_jobs_with_filters.return_value = {
            "jobs": [],
            "total": 100,
            "limit": 12,
            "offset": 50,
        }

        result = await jobs_router.get_jobs(
            job_id=None,
            status=None,
            created_at_start=None,
            created_at_end=None,
            limit=12,
            offset=50,
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200
        assert result["offset"] == 50


class TestGetJobById:
    """Tests for get_job_by_id endpoint."""

    @pytest.mark.asyncio
    async def test_get_job_success(self, mock_current_user, mock_job, mock_error_handler):
        """Test getting job by ID successfully."""
        job_svc = AsyncMock()
        job_svc.get_job.return_value = mock_job
        job_svc.enrich_job_file_urls = AsyncMock()

        result = await jobs_router.get_job_by_id(
            job_id="job-123",
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200
        assert result["job"]["id"] == "job-123"

    @pytest.mark.asyncio
    async def test_get_job_not_found(self, mock_current_user, mock_error_handler):
        """Test getting non-existent job."""
        job_svc = AsyncMock()
        job_svc.get_job.return_value = None

        mock_error_handler.raise_internal.side_effect = ResourceNotFoundError("Job", "job-999")

        with pytest.raises(ResourceNotFoundError):
            await jobs_router.get_job_by_id(
                job_id="job-999",
                current_user=mock_current_user,
                job_svc=job_svc,
            )

    @pytest.mark.asyncio
    async def test_get_job_access_denied(self, mock_current_user, mock_error_handler):
        """Test access denied when user doesn't own job."""
        other_job = {
            "id": "job-456",
            "user_id": "other-user",
            "displayname": "Other Job",
            "status": "uploaded",
        }
        job_svc = AsyncMock()
        job_svc.get_job.return_value = other_job

        mock_error_handler.raise_internal.side_effect = PermissionError("Access denied")

        with pytest.raises(PermissionError):
            await jobs_router.get_job_by_id(
                job_id="job-456",
                current_user=mock_current_user,
                job_svc=job_svc,
            )


class TestGetJobTranscription:
    """Tests for get_job_transcription endpoint."""

    @pytest.mark.asyncio
    async def test_get_transcription_from_text_content(self, mock_current_user, mock_error_handler):
        """Test getting transcription when text_content is available."""
        job = {
            "id": "job-123",
            "user_id": "user-123",
            "text_content": "Sample transcription text",
            "transcription_file_path": None,
        }
        job_svc = AsyncMock()
        job_svc.get_job.return_value = job
        storage_svc = AsyncMock()

        # This endpoint returns StreamingResponse, so we just verify the call doesn't raise
        result = await jobs_router.get_job_transcription(
            job_id="job-123",
            current_user=mock_current_user,
            job_svc=job_svc,
            storage_service=storage_svc,
        )

        assert result is not None  # Should return StreamingResponse

    @pytest.mark.asyncio
    async def test_get_transcription_not_found(self, mock_current_user, mock_error_handler):
        """Test transcription for non-existent job."""
        job_svc = AsyncMock()
        job_svc.get_job.return_value = None
        storage_svc = AsyncMock()

        mock_error_handler.raise_internal.side_effect = ResourceNotFoundError("Job", "job-999")

        with pytest.raises(ResourceNotFoundError):
            await jobs_router.get_job_transcription(
                job_id="job-999",
                current_user=mock_current_user,
                job_svc=job_svc,
                storage_service=storage_svc,
            )

    @pytest.mark.asyncio
    async def test_get_transcription_not_ready(self, mock_current_user, mock_error_handler):
        """Test transcription not ready error."""
        job = {
            "id": "job-123",
            "user_id": "user-123",
            "status": "uploaded",
            "text_content": None,
            "transcription_file_path": None,
        }
        job_svc = AsyncMock()
        job_svc.get_job.return_value = job
        storage_svc = AsyncMock()

        mock_error_handler.raise_internal.side_effect = ResourceNotReadyError(
            "Transcription not available",
            {"job_id": "job-123", "status": "uploaded"}
        )

        with pytest.raises(ResourceNotReadyError):
            await jobs_router.get_job_transcription(
                job_id="job-123",
                current_user=mock_current_user,
                job_svc=job_svc,
                storage_service=storage_svc,
            )


class TestGetJobAnalysisDocument:
    """Tests for analysis document download endpoint."""

    @pytest.mark.asyncio
    async def test_converts_markdown_source_to_docx(self, mock_current_user):
        analysis_path = "https://storage.blob.core.windows.net/uploads/analysis.md"
        job_svc = AsyncMock()
        job_svc.get_job.return_value = {
            "id": "job-123",
            "user_id": "user-123",
            "status": "completed",
            "analysis_file_path": analysis_path,
        }
        storage_svc = AsyncMock()
        storage_svc.download_text_from_blob.return_value = "# Analysis"
        storage_svc.generate_docx_bytes.return_value = b"docx bytes"

        result = await jobs_router.get_job_analysis_document(
            job_id="job-123",
            analysis_file_path=None,
            current_user=mock_current_user,
            job_svc=job_svc,
            storage_service=storage_svc,
        )

        assert result.media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert result.headers["content-disposition"] == 'attachment; filename="analysis.docx"'
        storage_svc.download_text_from_blob.assert_awaited_once_with(analysis_path)
        storage_svc.generate_docx_bytes.assert_awaited_once_with("# Analysis", add_title=False)
        storage_svc.download_blob_bytes.assert_not_called()

    @pytest.mark.asyncio
    async def test_streams_legacy_docx_source(self, mock_current_user):
        analysis_path = "https://storage.blob.core.windows.net/uploads/analysis.docx"
        job_svc = AsyncMock()
        job_svc.get_job.return_value = {
            "id": "job-123",
            "user_id": "user-123",
            "status": "completed",
            "analysis_file_path": analysis_path,
        }
        storage_svc = AsyncMock()
        storage_svc.download_blob_bytes.return_value = b"old docx"

        result = await jobs_router.get_job_analysis_document(
            job_id="job-123",
            analysis_file_path=f"{analysis_path}?sv=sas",
            current_user=mock_current_user,
            job_svc=job_svc,
            storage_service=storage_svc,
        )

        assert result.media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert result.headers["content-disposition"] == 'attachment; filename="analysis.docx"'
        storage_svc.download_blob_bytes.assert_awaited_once_with(analysis_path)
        storage_svc.download_text_from_blob.assert_not_called()
        storage_svc.generate_docx_bytes.assert_not_called()


class TestCreateJob:
    """Tests for create_job route wiring."""

    @pytest.mark.asyncio
    async def test_create_job_delegates_to_upload_service(self, mock_current_user, mock_error_handler):
        """Route handler delegates upload workflow and shapes REST response."""
        from io import BytesIO
        from starlette.datastructures import UploadFile

        upload = UploadFile(filename="recording.wav", file=BytesIO(b"audio"))
        upload_service = AsyncMock()
        upload_service.create_job_from_upload.return_value = {
            "id": "job-123",
            "status": "uploaded",
        }

        result = await jobs_router.create_job(
            file=upload,
            prompt_category_id="cat-1",
            prompt_subcategory_id="sub-1",
            pre_session_form_data='{"client":"web"}',
            current_user=mock_current_user,
            job_upload_service=upload_service,
        )

        assert result.status_code == 201
        assert result.headers["Location"] == "/api/v1/jobs/job-123"
        upload_service.create_job_from_upload.assert_awaited_once_with(
            file=upload,
            current_user=mock_current_user,
            prompt_category_id="cat-1",
            prompt_subcategory_id="sub-1",
            pre_session_form_data='{"client":"web"}',
        )


class TestUpdateJob:
    """Tests for update_job endpoint."""

    @pytest.mark.asyncio
    async def test_update_job_displayname(self, mock_current_user, mock_job, mock_error_handler):
        """Test updating job displayname."""
        updated_job = {**mock_job, "displayname": "Updated Job Name"}
        job_svc = AsyncMock()
        job_svc.get_job.return_value = mock_job
        job_svc.update_job_display_name.return_value = updated_job

        from app.api.v1.routes.jobs import JobUpdateRequest
        update_request = JobUpdateRequest(displayname="Updated Job Name")

        result = await jobs_router.update_job(
            job_id="job-123",
            update_request=update_request,
            current_user=mock_current_user,
            job_svc=job_svc,
        )

        assert result["status"] == 200
        assert result["job"]["displayname"] == "Updated Job Name"

    @pytest.mark.asyncio
    async def test_update_job_not_found(self, mock_current_user, mock_error_handler):
        """Test updating non-existent job."""
        job_svc = AsyncMock()
        job_svc.get_job.return_value = None

        mock_error_handler.raise_internal.side_effect = ResourceNotFoundError("Job", "job-999")

        from app.api.v1.routes.jobs import JobUpdateRequest
        update_request = JobUpdateRequest(displayname="New Name")

        with pytest.raises(ResourceNotFoundError):
            await jobs_router.update_job(
                job_id="job-999",
                update_request=update_request,
                current_user=mock_current_user,
                job_svc=job_svc,
            )


class TestDeleteJob:
    """Tests for delete_job endpoint."""

    @pytest.mark.asyncio
    async def test_delete_job_success(self, mock_current_user, mock_error_handler):
        """Test successful job deletion."""
        management_svc = AsyncMock()
        management_svc.soft_delete_job.return_value = {"status": "success"}
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        result = await jobs_router.delete_job(
            job_id="job-123",
            current_user=mock_current_user,
            management_service=management_svc,
            job_permissions=job_perms,
        )

        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_delete_job_not_found(self, mock_current_user, mock_error_handler):
        """Test deleting non-existent job."""
        management_svc = AsyncMock()
        management_svc.soft_delete_job.return_value = {
            "status": "error",
            "message": "not found",
        }
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        mock_error_handler.raise_internal.side_effect = ResourceNotFoundError("Job", "job-999")

        with pytest.raises(ResourceNotFoundError):
            await jobs_router.delete_job(
                job_id="job-999",
                current_user=mock_current_user,
                management_service=management_svc,
                job_permissions=job_perms,
            )

    @pytest.mark.asyncio
    async def test_delete_job_access_denied(self, mock_current_user, mock_error_handler):
        """Test delete access denied."""
        management_svc = AsyncMock()
        management_svc.soft_delete_job.return_value = {
            "status": "error",
            "message": "Access denied",
        }
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        mock_error_handler.raise_internal.side_effect = PermissionError("Access denied")

        with pytest.raises(PermissionError):
            await jobs_router.delete_job(
                job_id="job-123",
                current_user=mock_current_user,
                management_service=management_svc,
                job_permissions=job_perms,
            )


class TestRestoreJob:
    """Tests for restore_job endpoint."""

    @pytest.mark.asyncio
    async def test_restore_job_success(self, mock_current_user, mock_error_handler):
        """Test successful job restoration."""
        management_svc = AsyncMock()
        management_svc.restore_job.return_value = {"status": "success"}
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        result = await jobs_router.restore_job(
            job_id="job-123",
            current_user=mock_current_user,
            management_service=management_svc,
            job_permissions=job_perms,
        )

        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_restore_job_not_found(self, mock_current_user, mock_error_handler):
        """Test restore non-existent job."""
        management_svc = AsyncMock()
        management_svc.restore_job.return_value = {
            "status": "error",
            "message": "not found",
        }
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        mock_error_handler.raise_internal.side_effect = ResourceNotFoundError("Job", "job-999")

        with pytest.raises(ResourceNotFoundError):
            await jobs_router.restore_job(
                job_id="job-999",
                current_user=mock_current_user,
                management_service=management_svc,
                job_permissions=job_perms,
            )

    @pytest.mark.asyncio
    async def test_restore_job_access_denied(self, mock_current_user, mock_error_handler):
        """Test restore access denied."""
        management_svc = AsyncMock()
        management_svc.restore_job.return_value = {
            "status": "error",
            "message": "Access denied",
        }
        job_perms = AsyncMock()
        job_perms.check_user_admin_privileges = AsyncMock(return_value=False)

        mock_error_handler.raise_internal.side_effect = PermissionError("Access denied")

        with pytest.raises(PermissionError):
            await jobs_router.restore_job(
                job_id="job-123",
                current_user=mock_current_user,
                management_service=management_svc,
                job_permissions=job_perms,
            )
