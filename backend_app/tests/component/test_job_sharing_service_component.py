"""
Component tests for JobSharingService (job_sharing_service.py)

Tests for job sharing operations including:
- Sharing jobs with other users
- Unsharing jobs
- Getting sharing info
- Getting shared jobs
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
    return AsyncMock()


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    repository = AsyncMock()
    repository.get_by_email = AsyncMock(return_value=None)
    repository.get_by_id = AsyncMock(return_value=None)
    return repository


@pytest.fixture
def mock_job_repository():
    """Create a mock JobRepository."""
    repository = AsyncMock()
    repository.get_by_id = AsyncMock(return_value=None)
    repository.replace = AsyncMock()
    repository.query = AsyncMock()
    return repository


@pytest.fixture
def job_sharing_service(mock_cosmos, mock_job_repository, mock_user_repository):
    """Create a JobSharingService with mocked dependencies."""
    from app.services.jobs.job_sharing_service import JobSharingService
    return JobSharingService(
        job_repository=mock_job_repository,
        user_repository=mock_user_repository,
    )


def create_job(
    job_id: str = "job-123",
    user_id: str = "owner-123",
    user_email: str = "owner@example.com",
    shared_with: list = None,
    deleted: bool = False,
) -> Dict[str, Any]:
    """Helper to create test job dicts."""
    job = {
        "id": job_id,
        "user_id": user_id,
        "user_email": user_email,
        "type": "job",
        "status": "completed",
        "file_name": "test.wav",
        "created_at": datetime.now(UTC).isoformat(),
    }
    if shared_with is not None:
        job["shared_with"] = shared_with
    if deleted:
        job["deleted"] = True
    return job


def create_user(user_id: str = "user-123", email: str = "user@example.com") -> Dict[str, Any]:
    """Helper to create test user dicts."""
    return {"id": user_id, "email": email, "permission": "User"}


# ============================================================================
# TEST: share_job
# ============================================================================

class TestShareJob:
    """Tests for sharing jobs with other users."""
    
    @pytest.mark.asyncio
    async def test_shares_job_successfully(self, job_sharing_service, mock_user_repository, mock_job_repository):
        """Given valid job and target user, when sharing, then succeeds."""
        job = create_job()
        target_user = create_user("target-1", "target@example.com")
        
        mock_job_repository.get_by_id.return_value = job
        mock_user_repository.get_by_email.return_value = target_user
        
        with patch("app.services.jobs.job_sharing_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_sharing_service.share_job(
                job_id="job-123",
                owner_user_id="owner-123",
                target_user_email="target@example.com",
                permission_level="view"
            )
        
        assert result["status"] == "success"
        assert result["permission_level"] == "view"
        mock_job_repository.replace.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_job_not_found(self, job_sharing_service, mock_job_repository):
        """Given non-existent job, when sharing, then returns error."""
        mock_job_repository.get_by_id.return_value = None
        
        result = await job_sharing_service.share_job(
            job_id="nonexistent",
            owner_user_id="owner-123",
            target_user_email="target@example.com"
        )
        
        assert result["status"] == "error"
        assert "not found" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_not_owner(self, job_sharing_service, mock_job_repository):
        """Given non-owner user, when sharing, then returns error."""
        job = create_job(user_id="actual-owner")
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_sharing_service.share_job(
            job_id="job-123",
            owner_user_id="not-owner",
            target_user_email="target@example.com"
        )
        
        assert result["status"] == "error"
        assert "not job owner" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_returns_error_when_target_user_not_found(
        self,
        job_sharing_service,
        mock_user_repository,
        mock_job_repository,
    ):
        """Given non-existent target user, when sharing, then returns error."""
        job = create_job()
        mock_job_repository.get_by_id.return_value = job
        mock_user_repository.get_by_email.return_value = None
        
        result = await job_sharing_service.share_job(
            job_id="job-123",
            owner_user_id="owner-123",
            target_user_email="nonexistent@example.com"
        )
        
        assert result["status"] == "error"
        assert "not found" in result["message"].lower()
    
    @pytest.mark.asyncio
    async def test_updates_existing_share(self, job_sharing_service, mock_user_repository, mock_job_repository):
        """Given already shared job, when sharing again, then updates permission."""
        job = create_job(shared_with=[{
            "user_id": "target-1",
            "user_email": "target@example.com",
            "permission_level": "view"
        }])
        target_user = create_user("target-1", "target@example.com")
        
        mock_job_repository.get_by_id.return_value = job
        mock_user_repository.get_by_email.return_value = target_user
        
        with patch("app.services.jobs.job_sharing_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_sharing_service.share_job(
                job_id="job-123",
                owner_user_id="owner-123",
                target_user_email="target@example.com",
                permission_level="edit"  # Changed from view to edit
            )
        
        assert result["status"] == "success"
        assert result["permission_level"] == "edit"


# ============================================================================
# TEST: unshare_job
# ============================================================================

class TestUnshareJob:
    """Tests for removing job sharing."""
    
    @pytest.mark.asyncio
    async def test_unshares_job_successfully(self, job_sharing_service, mock_job_repository):
        """Given shared job, when unsharing, then removes share."""
        job = create_job(shared_with=[{
            "user_id": "target-1",
            "user_email": "target@example.com",
            "permission_level": "view"
        }])
        mock_job_repository.get_by_id.return_value = job
        
        with patch("app.services.jobs.job_sharing_service.invalidate_job_cache", new_callable=AsyncMock):
            result = await job_sharing_service.unshare_job(
                job_id="job-123",
                owner_user_id="owner-123",
                target_user_email="target@example.com"
            )
        
        assert result["status"] == "success"
        assert result["shared_with_count"] == 0
    
    @pytest.mark.asyncio
    async def test_returns_error_when_not_shared(self, job_sharing_service, mock_job_repository):
        """Given job not shared with user, when unsharing, then returns error."""
        job = create_job(shared_with=[])
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_sharing_service.unshare_job(
            job_id="job-123",
            owner_user_id="owner-123",
            target_user_email="notshared@example.com"
        )
        
        assert result["status"] == "error"
    
    @pytest.mark.asyncio
    async def test_returns_error_when_job_not_found(self, job_sharing_service, mock_job_repository):
        """Given non-existent job, when unsharing, then returns error."""
        mock_job_repository.get_by_id.return_value = None
        
        result = await job_sharing_service.unshare_job(
            job_id="nonexistent",
            owner_user_id="owner-123",
            target_user_email="target@example.com"
        )
        
        assert result["status"] == "error"


# ============================================================================
# TEST: get_job_sharing_info
# ============================================================================

class TestGetJobSharingInfo:
    """Tests for retrieving job sharing information."""
    
    @pytest.mark.asyncio
    async def test_returns_sharing_info_for_owner(self, job_sharing_service, mock_job_repository):
        """Given owner requesting info, when getting info, then returns details."""
        job = create_job(shared_with=[{
            "user_id": "target-1",
            "user_email": "target@example.com"
        }])
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_sharing_service.get_job_sharing_info(
            job_id="job-123",
            current_user={"id": "owner-123", "email": "owner@example.com"}
        )
        
        assert result["status"] == "success"
        assert result["sharing_info"]["is_owner"] is True
        assert result["sharing_info"]["shared_with_count"] == 1
    
    @pytest.mark.asyncio
    async def test_returns_sharing_info_for_shared_user(self, job_sharing_service, mock_job_repository):
        """Given shared user requesting info, when getting info, then returns details."""
        job = create_job(shared_with=[{
            "user_id": "shared-user",
            "user_email": "shared@example.com"
        }])
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_sharing_service.get_job_sharing_info(
            job_id="job-123",
            current_user={"id": "shared-user", "email": "shared@example.com"}
        )
        
        assert result["status"] == "success"
        assert result["sharing_info"]["is_owner"] is False
    
    @pytest.mark.asyncio
    async def test_denies_access_for_unauthorized_user(self, job_sharing_service, mock_job_repository):
        """Given unauthorized user, when getting info, then returns error."""
        job = create_job(shared_with=[])
        mock_job_repository.get_by_id.return_value = job
        
        result = await job_sharing_service.get_job_sharing_info(
            job_id="job-123",
            current_user={"id": "other-user", "email": "other@example.com"}
        )
        
        assert result["status"] == "error"
        assert "denied" in result["message"].lower()


# ============================================================================
# TEST: get_shared_jobs
# ============================================================================

class TestGetSharedJobs:
    """Tests for retrieving all shared jobs for a user."""
    
    @pytest.mark.asyncio
    async def test_returns_shared_jobs(self, job_sharing_service, mock_job_repository):
        """Given user with shared jobs, when getting shared jobs, then returns them."""
        mock_job_repository.query.side_effect = [
            [create_job("job-1")],
            [create_job("job-2")],
        ]

        with patch("app.services.jobs.job_sharing_service._shared_jobs_cache") as mock_cache:
            mock_cache.get_or_compute = AsyncMock(return_value={
                "shared_jobs": [create_job("job-1")],
                "owned_jobs_shared_with_others": [create_job("job-2")]
            })
            
            result = await job_sharing_service.get_shared_jobs("user-123")
        
        assert "shared_jobs" in result
        assert "owned_jobs_shared_with_others" in result


# ============================================================================
# TEST: close
# ============================================================================

class TestClose:
    """Tests for service cleanup."""
    
    def test_close_is_noop(self, job_sharing_service):
        """Given service, when closing, then no error is raised."""
        # Should not raise
        job_sharing_service.close()
