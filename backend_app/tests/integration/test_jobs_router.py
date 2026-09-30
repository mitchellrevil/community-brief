"""
Integration tests for jobs_router.py

Tests for jobs API endpoints including:
- GET /api/v1/jobs - list jobs with filters
- GET /api/v1/jobs/{job_id} - get specific job
- GET /api/v1/jobs/{job_id}/transcription - get job transcription
- POST /api/v1/jobs - create job via file upload
- PATCH /api/v1/jobs/{job_id} - update job displayname
- DELETE /api/v1/jobs/{job_id} - soft delete job
- POST /api/v1/jobs/{job_id}/restore - restore soft-deleted job
- GET /api/v1/stream/jobs/{job_id}/status - SSE status updates
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any
from datetime import UTC, datetime
from io import BytesIO
from fastapi import HTTPException


# Mark all tests as integration tests
pytestmark = pytest.mark.integration


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_current_user():
    """Create a mock current user."""
    return {
        "id": "user_123",
        "email": "user@example.com",
        "permission": "User",
    }


@pytest.fixture
def mock_admin_user():
    """Create a mock admin user."""
    return {
        "id": "admin_123",
        "email": "admin@example.com",
        "permission": "Admin",
    }


@pytest.fixture
def mock_job_service():
    """Create a mock JobService."""
    service = AsyncMock()
    service.get_jobs_with_filters = AsyncMock()
    service.get_job = AsyncMock()
    service.enrich_job_file_urls = AsyncMock()
    service.upload_and_create_job = AsyncMock()
    service.repository = AsyncMock()
    service.repository.replace = AsyncMock()
    return service


@pytest.fixture
def mock_job_management_service():
    """Create a mock JobManagementService."""
    service = AsyncMock()
    service.soft_delete_job = AsyncMock()
    service.restore_job = AsyncMock()
    return service


@pytest.fixture
def mock_job_permissions():
    """Create a mock JobPermissions."""
    permissions = AsyncMock()
    permissions.check_user_admin_privileges = AsyncMock(return_value=False)
    return permissions


@pytest.fixture
def mock_storage_service():
    """Create a mock StorageService."""
    service = MagicMock()
    service.stream_blob_content = MagicMock()
    return service


@pytest.fixture
def mock_analytics_service():
    """Create a mock AnalyticsService."""
    service = AsyncMock()
    service.track_job_event = AsyncMock()
    return service


@pytest.fixture
def mock_error_handler():
    """Create a mock ErrorHandler."""
    handler = MagicMock()
    handler.raise_internal = MagicMock(side_effect=HTTPException(status_code=500, detail="Internal Error"))
    return handler


def create_job(
    job_id: str = "job_123",
    user_id: str = "user_123",
    status: str = "completed",
    displayname: str = "Test Job",
) -> Dict[str, Any]:
    """Helper to create test job dicts."""
    return {
        "id": job_id,
        "user_id": user_id,
        "status": status,
        "displayname": displayname,
        "created_at": int(datetime.now(UTC).timestamp() * 1000),
        "shared_with": [],
    }


@pytest.mark.asyncio
async def test_create_job_concurrency_limit(monkeypatch, mock_current_user, mock_job_service, mock_analytics_service, mock_error_handler):
    """When upload workflow rejects admission, the route returns the service error."""
    from app.api.v1.routes.jobs import create_job
    from starlette.datastructures import UploadFile
    from io import BytesIO
    from fastapi import HTTPException
    from unittest.mock import AsyncMock

    fake_upload = UploadFile(filename="a.wav", file=BytesIO(b"x"))
    upload_service = AsyncMock()
    upload_service.create_job_from_upload.side_effect = HTTPException(
        status_code=429,
        detail="Too many concurrent uploads, try again later.",
    )

    with pytest.raises(HTTPException) as exc:
        await create_job(
            file=fake_upload,
            prompt_category_id=None,
            prompt_subcategory_id=None,
            pre_session_form_data=None,
            current_user=mock_current_user,
            job_upload_service=upload_service,
        )

    assert exc.value.status_code == 429


# ============================================================================
# TEST: GET /api/v1/jobs
# ============================================================================

class TestGetJobs:
    """Tests for listing jobs endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_jobs_for_user(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given authenticated user, when listing jobs, then returns user's jobs."""
        from app.api.v1.routes.jobs import get_jobs
        
        mock_job_service.get_jobs_with_filters.return_value = {
            "items": [create_job()],
            "total": 1,
        }
        
        result = await get_jobs(
            job_id=None,
            status=None,
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        assert result["status"] == 200
        assert "items" in result
    
    @pytest.mark.asyncio
    async def test_filters_by_job_id(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given job_id filter, when listing jobs, then applies filter."""
        from app.api.v1.routes.jobs import get_jobs
        
        mock_job_service.get_jobs_with_filters.return_value = {
            "items": [create_job()],
            "total": 1,
        }
        
        await get_jobs(
            job_id="job_123",
            status=None,
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        mock_job_service.get_jobs_with_filters.assert_called_with(
            current_user=mock_current_user,
            job_id="job_123",
            status=None,
            created_at_start=None,
            created_at_end=None,
            limit=12,
            offset=0,
        )
    
    @pytest.mark.asyncio
    async def test_filters_by_status(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given status filter, when listing jobs, then applies filter."""
        from app.api.v1.routes.jobs import get_jobs
        
        mock_job_service.get_jobs_with_filters.return_value = {
            "items": [],
            "total": 0,
        }
        
        await get_jobs(
            job_id=None,
            status="completed",
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        mock_job_service.get_jobs_with_filters.assert_called_with(
            current_user=mock_current_user,
            job_id=None,
            status="completed",
            created_at_start=None,
            created_at_end=None,
            limit=12,
            offset=0,
        )

    @pytest.mark.asyncio
    async def test_filters_by_created_at_range(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given created_at_start/end, when listing jobs, then passes parsed timestamps."""
        from app.api.v1.routes.jobs import get_jobs
        from datetime import UTC, datetime, timedelta

        mock_job_service.get_jobs_with_filters.return_value = {
            "items": [create_job()],
            "total": 1,
        }

        # Provide date-only inputs
        start = "2025-01-01"
        end = "2025-01-03"

        # Expected ISO strings
        start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=UTC)
        expected_start_iso = start_dt.isoformat()
        end_dt = datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=UTC) + timedelta(days=1) - timedelta(milliseconds=1)
        expected_end_iso = end_dt.isoformat()

        await get_jobs(
            job_id=None,
            status=None,
            created_at_start=start,
            created_at_end=end,
            limit=12,
            offset=0,
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )

        mock_job_service.get_jobs_with_filters.assert_called_with(
            current_user=mock_current_user,
            job_id=None,
            status=None,
            created_at_start=expected_start_iso,
            created_at_end=expected_end_iso,
            limit=12,
            offset=0,
        )

    @pytest.mark.asyncio
    async def test_raises_400_on_invalid_date_format(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        from app.api.v1.routes.jobs import get_jobs
        from app.core.errors.domain import ValidationError

        with pytest.raises(ValidationError):
            await get_jobs(
                job_id=None,
                status=None,
                created_at_start="not-a-date",
                created_at_end=None,
                limit=12,
                offset=0,
                current_user=mock_current_user,
                job_svc=mock_job_service,
            )


# ============================================================================
# TEST: GET /api/v1/jobs/{job_id}
# ============================================================================

class TestGetJobById:
    """Tests for getting a specific job endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_job_when_found(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given existing job, when getting by id, then returns job."""
        from app.api.v1.routes.jobs import get_job_by_id
        
        job = create_job(user_id="user_123")
        mock_job_service.get_job.return_value = job
        
        result = await get_job_by_id(
            job_id="job_123",
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        assert result["status"] == 200
        assert result["job"]["id"] == "job_123"
    
    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given nonexistent job, when getting by id, then raises 404."""
        from app.api.v1.routes.jobs import get_job_by_id
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_job_service.get_job.return_value = None
        
        with pytest.raises(ResourceNotFoundError):
            await get_job_by_id(
                job_id="nonexistent",
                current_user=mock_current_user,
                job_svc=mock_job_service,
            )
    
    @pytest.mark.asyncio
    async def test_raises_403_when_access_denied(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given job user doesn't own, when getting, then raises 403."""
        from app.api.v1.routes.jobs import get_job_by_id
        from app.core.errors.domain import PermissionError
        
        job = create_job(user_id="other_user")  # Different user
        mock_job_service.get_job.return_value = job
        
        with pytest.raises(PermissionError):
            await get_job_by_id(
                job_id="job_123",
                current_user=mock_current_user,
                job_svc=mock_job_service,
            )
    
    @pytest.mark.asyncio
    async def test_enriches_job_with_file_urls(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given job, when getting by id, then enriches with file URLs."""
        from app.api.v1.routes.jobs import get_job_by_id
        
        job = create_job(user_id="user_123")
        mock_job_service.get_job.return_value = job
        
        await get_job_by_id(
            job_id="job_123",
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        mock_job_service.enrich_job_file_urls.assert_called_once()


# ============================================================================
# TEST: GET /api/v1/jobs/{job_id}/transcription
# ============================================================================

class TestGetJobTranscription:
    """Tests for getting job transcription endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_text_content_when_available(
        self, mock_current_user, mock_job_service, mock_storage_service, mock_error_handler
    ):
        """Given job with text_content, when getting transcription, then returns text."""
        from app.api.v1.routes.jobs import get_job_transcription
        
        job = create_job(user_id="user_123")
        job["text_content"] = "This is the transcription"
        mock_job_service.get_job.return_value = job
        
        result = await get_job_transcription(
            job_id="job_123",
            current_user=mock_current_user,
            job_svc=mock_job_service,
            storage_service=mock_storage_service,
        )
        
        assert result is not None
        # StreamingResponse returned
    
    @pytest.mark.asyncio
    async def test_raises_404_when_job_not_found(
        self, mock_current_user, mock_job_service, mock_storage_service, mock_error_handler
    ):
        """Given nonexistent job, when getting transcription, then raises 404."""
        from app.api.v1.routes.jobs import get_job_transcription
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_job_service.get_job.return_value = None
        
        with pytest.raises(ResourceNotFoundError):
            await get_job_transcription(
                job_id="nonexistent",
                current_user=mock_current_user,
                job_svc=mock_job_service,
                storage_service=mock_storage_service,
            )


# ============================================================================
# TEST: PATCH /api/v1/jobs/{job_id}
# ============================================================================

class TestUpdateJob:
    """Tests for updating job endpoint."""
    
    @pytest.mark.asyncio
    async def test_updates_displayname(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given valid update request, when updating job, then updates displayname."""
        from app.api.v1.routes.jobs import update_job, JobUpdateRequest
        
        job = create_job(user_id="user_123")
        mock_job_service.get_job.return_value = job
        mock_job_service.repository.replace.return_value = {**job, "displayname": "New Name"}
        
        request = JobUpdateRequest(displayname="New Name")
        
        result = await update_job(
            job_id="job_123",
            update_request=request,
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        assert result["status"] == 200
    
    @pytest.mark.asyncio
    async def test_raises_404_when_job_not_found(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given nonexistent job, when updating, then raises 404."""
        from app.api.v1.routes.jobs import update_job, JobUpdateRequest
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_job_service.get_job.return_value = None
        request = JobUpdateRequest(displayname="New Name")
        
        with pytest.raises(ResourceNotFoundError):
            await update_job(
                job_id="nonexistent",
                update_request=request,
                current_user=mock_current_user,
                job_svc=mock_job_service,
            )


# ============================================================================
# TEST: DELETE /api/v1/jobs/{job_id}
# ============================================================================

class TestDeleteJob:
    """Tests for soft-deleting job endpoint."""
    
    @pytest.mark.asyncio
    async def test_soft_deletes_job_for_owner(
        self, mock_current_user, mock_job_service, mock_job_management_service,
        mock_job_permissions, mock_error_handler
    ):
        """Given job owner, when deleting job, then soft deletes."""
        from app.api.v1.routes.jobs import delete_job
        
        mock_job_management_service.soft_delete_job.return_value = {
            "status": "success",
            "job_id": "job_123",
        }
        
        result = await delete_job(
            job_id="job_123",
            current_user=mock_current_user,
            job_svc=mock_job_service,
            management_service=mock_job_management_service,
            job_permissions=mock_job_permissions,
        )
        
        assert result["status"] == "success"
        mock_job_management_service.soft_delete_job.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_raises_403_when_access_denied(
        self, mock_current_user, mock_job_service, mock_job_management_service,
        mock_job_permissions, mock_error_handler
    ):
        """Given non-owner user, when deleting job, then raises 403."""
        from app.api.v1.routes.jobs import delete_job
        from app.core.errors.domain import PermissionError
        
        mock_job_management_service.soft_delete_job.return_value = {
            "status": "error",
            "message": "Access denied",
        }
        
        with pytest.raises(PermissionError):
            await delete_job(
                job_id="job_123",
                current_user=mock_current_user,
                job_svc=mock_job_service,
                management_service=mock_job_management_service,
                job_permissions=mock_job_permissions,
            )


# ============================================================================
# TEST: POST /api/v1/jobs/{job_id}/restore
# ============================================================================

class TestRestoreJob:
    """Tests for restoring soft-deleted job endpoint."""
    
    @pytest.mark.asyncio
    async def test_restores_job_for_owner(
        self, mock_current_user, mock_job_management_service,
        mock_job_permissions, mock_error_handler
    ):
        """Given job owner, when restoring job, then restores."""
        from app.api.v1.routes.jobs import restore_job
        
        mock_job_management_service.restore_job.return_value = {
            "status": "success",
            "job_id": "job_123",
        }
        
        result = await restore_job(
            job_id="job_123",
            current_user=mock_current_user,
            management_service=mock_job_management_service,
            job_permissions=mock_job_permissions,
        )
        
        assert result["status"] == "success"
        mock_job_management_service.restore_job.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_raises_404_when_job_not_found(
        self, mock_current_user, mock_job_management_service,
        mock_job_permissions, mock_error_handler
    ):
        """Given nonexistent job, when restoring, then raises 404."""
        from app.api.v1.routes.jobs import restore_job
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_job_management_service.restore_job.return_value = {
            "status": "error",
            "message": "Job not found",
        }
        
        with pytest.raises(ResourceNotFoundError):
            await restore_job(
                job_id="nonexistent",
                current_user=mock_current_user,
                management_service=mock_job_management_service,
                job_permissions=mock_job_permissions,
            )


# ============================================================================
# TEST: Job Access Control
# ============================================================================

class TestJobAccessControl:
    """Tests for job access control logic."""
    
    @pytest.mark.asyncio
    async def test_job_owner_can_access(
        self, mock_current_user, mock_job_service, mock_error_handler
    ):
        """Given job owner, when accessing job, then allowed."""
        from app.api.v1.routes.jobs import get_job_by_id
        
        job = create_job(user_id="user_123")  # Same as current user
        mock_job_service.get_job.return_value = job
        
        result = await get_job_by_id(
            job_id="job_123",
            current_user=mock_current_user,
            job_svc=mock_job_service,
        )
        
        assert result["job"]["is_owned"] is True
    
    @pytest.mark.asyncio
    async def test_shared_user_can_access(
        self, mock_job_service, mock_error_handler
    ):
        """Given user with shared access, when accessing job, then allowed."""
        from app.api.v1.routes.jobs import get_job_by_id
        
        current_user = {"id": "shared_user", "email": "shared@example.com", "permission": "User"}
        job = create_job(user_id="owner_user")
        job["shared_with"] = [{"user_id": "shared_user", "permission": "view"}]
        mock_job_service.get_job.return_value = job
        
        result = await get_job_by_id(
            job_id="job_123",
            current_user=current_user,
            job_svc=mock_job_service,
        )
        
        assert result["job"]["is_owned"] is False
    
    @pytest.mark.asyncio
    async def test_admin_can_access_any_job(
        self, mock_admin_user, mock_job_service, mock_error_handler
    ):
        """Given admin user, when accessing any job, then allowed."""
        from app.api.v1.routes.jobs import get_job_by_id
        
        job = create_job(user_id="other_user")  # Different user
        mock_job_service.get_job.return_value = job
        
        result = await get_job_by_id(
            job_id="job_123",
            current_user=mock_admin_user,
            job_svc=mock_job_service,
        )
        
        assert result["status"] == 200
