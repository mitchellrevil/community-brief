"""
Component tests for JobManagementService (job_management_service.py)

Tests for job management operations including:
- Soft delete and restore
- Permanent delete
- Getting deleted jobs
- Getting user's jobs
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import UTC, datetime
from typing import Dict, Any


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_cosmos():
    """Create a mock CosmosService."""
    cosmos = AsyncMock()
    return cosmos


@pytest.fixture
def mock_job_service():
    """Create a mock JobService."""
    service = AsyncMock()
    service.enrich_job_file_urls = AsyncMock(side_effect=lambda job: job)
    return service


@pytest.fixture
def mock_job_repository():
    """Create a mock JobRepository."""
    repository = AsyncMock()
    repository.get_by_id = AsyncMock(return_value=None)
    repository.replace = AsyncMock()
    repository.delete = AsyncMock()
    repository.query = AsyncMock()
    return repository


@pytest.fixture
def job_management_service(mock_cosmos, mock_job_service, mock_job_repository):
    """Create a JobManagementService with mocked dependencies."""
    from app.services.jobs.job_management_service import JobManagementService
    return JobManagementService(
        job_service=mock_job_service,
        job_repository=mock_job_repository,
    )


def create_job(
    job_id: str = "job-123",
    user_id: str = "owner-123",
    deleted: bool = False,
    text_content: str = None,
) -> Dict[str, Any]:
    """Helper to create test job dicts."""
    job = {
        "id": job_id,
        "user_id": user_id,
        "type": "job",
        "status": "completed",
        "file_name": "test.wav",
        "created_at": datetime.now(UTC).isoformat(),
    }
    if deleted:
        job["deleted"] = True
        job["deleted_at"] = datetime.now(UTC).isoformat()
    if text_content:
        job["text_content"] = text_content
    return job


# ============================================================================
# TEST: soft_delete_job
# ============================================================================

class TestSoftDeleteJob:
    """Tests for soft delete job functionality."""
    
    @pytest.mark.asyncio
    async def test_soft_deletes_job_successfully(self, job_management_service, mock_job_repository):
        """Given valid job and owner, when soft deleting, then succeeds."""
        job = create_job()
        mock_job_repository.get_by_id.return_value = job
        
        with patch("app.services.jobs.job_management_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_management_service.soft_delete_job(
                job_id="job-123",
                user_id="owner-123"
            )
        
        assert result["status"] == "success"
        assert "deleted_at" in result
        mock_job_repository.replace.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_job_not_found(self, job_management_service, mock_job_repository):
        """Given non-existent job, when soft deleting, then returns error."""
        mock_job_repository.get_by_id.return_value = None
        
        result = await job_management_service.soft_delete_job(
            job_id="nonexistent",
            user_id="owner-123"
        )
        
        assert result["status"] == "error"
        assert "not found" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_not_owner(self, job_management_service, mock_job_repository):
        """Given non-owner user, when soft deleting, then returns error."""
        job = create_job(user_id="actual-owner")
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.soft_delete_job(
            job_id="job-123",
            user_id="not-owner"
        )
        
        assert result["status"] == "error"
        assert "access denied" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_admin_can_delete_any_job(self, job_management_service, mock_job_repository):
        """Given admin user, when soft deleting other's job, then succeeds."""
        job = create_job(user_id="other-owner")
        mock_job_repository.get_by_id.return_value = job
        
        with patch("app.services.jobs.job_management_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_management_service.soft_delete_job(
                job_id="job-123",
                user_id="admin-user",
                is_admin=True
            )
        
        assert result["status"] == "success"
    
    @pytest.mark.asyncio
    async def test_returns_error_when_already_deleted(self, job_management_service, mock_job_repository):
        """Given already deleted job, when soft deleting, then returns error."""
        job = create_job(deleted=True)
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.soft_delete_job(
            job_id="job-123",
            user_id="owner-123"
        )
        
        assert result["status"] == "error"
        assert "already deleted" in result["message"].lower()


# ============================================================================
# TEST: restore_job
# ============================================================================

class TestRestoreJob:
    """Tests for restore job functionality."""
    
    @pytest.mark.asyncio
    async def test_restores_job_successfully(self, job_management_service, mock_job_repository):
        """Given deleted job, when restoring, then succeeds."""
        job = create_job(deleted=True)
        mock_job_repository.get_by_id.return_value = job
        
        with patch("app.services.jobs.job_management_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_management_service.restore_job(
                job_id="job-123",
                user_id="owner-123"
            )
        
        assert result["status"] == "success"
        assert "restored_at" in result
    
    @pytest.mark.asyncio
    async def test_returns_error_when_not_deleted(self, job_management_service, mock_job_repository):
        """Given non-deleted job, when restoring, then returns error."""
        job = create_job(deleted=False)
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.restore_job(
            job_id="job-123",
            user_id="owner-123"
        )
        
        assert result["status"] == "error"
        assert "not deleted" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_not_owner(self, job_management_service, mock_job_repository):
        """Given non-owner user, when restoring, then returns error."""
        job = create_job(user_id="actual-owner", deleted=True)
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.restore_job(
            job_id="job-123",
            user_id="not-owner"
        )
        
        assert result["status"] == "error"


# ============================================================================
# TEST: permanent_delete_job
# ============================================================================

class TestPermanentDeleteJob:
    """Tests for permanent delete job functionality."""
    
    @pytest.mark.asyncio
    async def test_permanently_deletes_job_for_admin(self, job_management_service, mock_job_repository):
        """Given admin user, when permanently deleting, then succeeds."""
        job = create_job()
        mock_job_repository.get_by_id.return_value = job
        mock_job_repository.delete.return_value = True
        
        with patch("app.services.jobs.job_management_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_management_service.permanent_delete_job(
                job_id="job-123",
                user_id="admin-user",
                is_admin=True
            )
        
        assert result["status"] == "success"
        mock_job_repository.delete.assert_called_once_with("job-123")
    
    @pytest.mark.asyncio
    async def test_denies_access_for_non_admin(self, job_management_service):
        """Given non-admin user, when permanently deleting, then returns error."""
        result = await job_management_service.permanent_delete_job(
            job_id="job-123",
            user_id="regular-user",
            is_admin=False
        )
        
        assert result["status"] == "error"
        assert "admin" in result["message"].lower()


# ============================================================================
# TEST: get_deleted_jobs
# ============================================================================

class TestGetDeletedJobs:
    """Tests for getting deleted jobs functionality."""
    
    @pytest.mark.asyncio
    async def test_returns_deleted_jobs_for_admin(self, job_management_service, mock_job_repository, mock_job_service):
        """Given admin user, when getting deleted jobs, then returns them."""
        deleted_job = create_job(deleted=True)
        mock_job_repository.query.side_effect = [[1], [deleted_job]]
        
        result = await job_management_service.get_deleted_jobs(
            user_id="admin-user",
            is_admin=True
        )
        
        assert result["status"] == "success"
        assert "deleted_jobs" in result
    
    @pytest.mark.asyncio
    async def test_denies_access_for_non_admin(self, job_management_service):
        """Given non-admin user, when getting deleted jobs, then returns error."""
        result = await job_management_service.get_deleted_jobs(
            user_id="regular-user",
            is_admin=False
        )
        
        assert result["status"] == "error"
        assert "admin" in result["message"].lower()


# ============================================================================
# TEST: get_my_jobs
# ============================================================================

class TestGetMyJobs:
    """Tests for getting user's own jobs."""
    
    @pytest.mark.asyncio
    async def test_returns_user_jobs(self, job_management_service, mock_job_repository, mock_job_service):
        """Given user with jobs, when getting my jobs, then returns them."""
        user_job = create_job()
        mock_job_repository.query.side_effect = [[1], [user_job]]
        
        result = await job_management_service.get_my_jobs(
            user_id="owner-123",
            limit=100,
            offset=0
        )
        
        assert result["status"] == "success"
        assert len(result["jobs"]) == 1
    
    @pytest.mark.asyncio
    async def test_excludes_deleted_by_default(self, job_management_service, mock_job_repository, mock_job_service):
        """Given deleted jobs, when getting my jobs without flag, then excludes them."""
        mock_job_repository.query.side_effect = [[0], []]
        
        result = await job_management_service.get_my_jobs(
            user_id="owner-123",
            include_deleted=False
        )
        
        # Verify the query was constructed correctly (deleted filter applied)
        query = mock_job_repository.query.call_args_list[0].args[0]
        assert "deleted" in query.lower()


# ============================================================================
# TEST: trigger_analysis_processing
# ============================================================================

class TestTriggerAnalysisProcessing:
    """Tests for triggering analysis processing."""
    
    @pytest.mark.asyncio
    async def test_triggers_processing_successfully(self, job_management_service, mock_job_repository):
        """Given job with text content, when triggering analysis, then succeeds."""
        job = create_job(text_content="Some text to analyze")
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.trigger_analysis_processing(
            job_id="job-123",
            user_id="owner-123"
        )
        
        assert result["status"] == "success"
        mock_job_repository.replace.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_no_text_content(self, job_management_service, mock_job_repository):
        """Given job without text, when triggering analysis, then returns error."""
        job = create_job()  # No text_content
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_management_service.trigger_analysis_processing(
            job_id="job-123",
            user_id="owner-123"
        )
        
        assert result["status"] == "error"
        assert "no text content" in result["message"].lower()


# ============================================================================
# TEST: close
# ============================================================================

class TestClose:
    """Tests for service cleanup."""
    
    def test_close_is_noop(self, job_management_service):
        """Given service, when closing, then no error is raised."""
        # Should not raise
        job_management_service.close()
