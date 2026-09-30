"""
Unit tests for job_permissions.py

Tests for job access control including:
- check_job_access function
- JobPermissions class
"""

import pytest
from unittest.mock import MagicMock
from typing import Dict, Any


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

def create_job(
    user_id: str = "owner-123",
    shared_with: list = None,
    deleted: bool = False,
) -> Dict[str, Any]:
    """Helper to create test job dicts."""
    job = {
        "id": "job-123",
        "user_id": user_id,
        "type": "job",
        "status": "completed",
    }
    if shared_with is not None:
        job["shared_with"] = shared_with
    if deleted:
        job["deleted"] = True
    return job


def create_user(
    user_id: str = "user-123",
    permission: str = "User",
) -> Dict[str, Any]:
    """Helper to create test user dicts."""
    return {"id": user_id, "permission": permission}


# ============================================================================
# TEST: check_job_access
# ============================================================================

class TestCheckJobAccess:
    """Tests for check_job_access function."""
    
    def test_denies_access_to_deleted_job(self):
        """Given deleted job, when checking access, then returns False."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(deleted=True)
        user = create_user()
        
        result = check_job_access(job, user)
        
        assert result is False
    
    def test_grants_access_to_admin(self):
        """Given admin user, when checking access, then returns True."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(user_id="other-owner")
        user = create_user(permission="Admin")
        
        result = check_job_access(job, user)
        
        assert result is True
    
    def test_grants_access_to_owner(self):
        """Given job owner, when checking access, then returns True."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(user_id="user-123")
        user = create_user(user_id="user-123")
        
        result = check_job_access(job, user)
        
        assert result is True
    
    def test_grants_access_to_shared_user_with_view(self):
        """Given user with view permission, when checking view, then returns True."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(
            user_id="owner",
            shared_with=[{"user_id": "viewer-123", "permission_level": "view"}]
        )
        user = create_user(user_id="viewer-123")
        
        result = check_job_access(job, user, required_permission="view")
        
        assert result is True
    
    def test_denies_edit_access_to_view_only_user(self):
        """Given user with view permission, when checking edit, then returns False."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(
            user_id="owner",
            shared_with=[{"user_id": "viewer-123", "permission_level": "view"}]
        )
        user = create_user(user_id="viewer-123")
        
        result = check_job_access(job, user, required_permission="edit")
        
        assert result is False
    
    def test_grants_edit_access_to_editor(self):
        """Given user with edit permission, when checking edit, then returns True."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(
            user_id="owner",
            shared_with=[{"user_id": "editor-123", "permission_level": "edit"}]
        )
        user = create_user(user_id="editor-123")
        
        result = check_job_access(job, user, required_permission="edit")
        
        assert result is True
    
    def test_denies_access_to_unrelated_user(self):
        """Given unrelated user, when checking access, then returns False."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(user_id="owner")
        user = create_user(user_id="stranger")
        
        result = check_job_access(job, user)
        
        assert result is False
    
    def test_handles_admin_in_permissions_list(self):
        """Given user with permissions list containing admin, then grants access."""
        from app.services.jobs.job_permissions import check_job_access
        
        job = create_job(user_id="owner")
        user = {"id": "user-123", "permissions": ["Admin", "User"]}
        
        result = check_job_access(job, user)
        
        assert result is True


# ============================================================================
# TEST: JobPermissions class
# ============================================================================

class TestJobPermissionsClass:
    """Tests for JobPermissions class."""
    
    @pytest.fixture
    def mock_permission_service(self):
        """Create a mock PermissionService."""
        service = MagicMock()
        service.has_permission_level_method = MagicMock(return_value=False)
        return service
    
    @pytest.fixture
    def job_permissions(self, mock_permission_service):
        """Create a JobPermissions instance."""
        from app.services.jobs.job_permissions import JobPermissions
        return JobPermissions(permission_service=mock_permission_service)
    
    @pytest.mark.asyncio
    async def test_check_job_access_with_job_dict(self, job_permissions):
        """Given job dict, when checking access, then uses check_job_access."""
        job = create_job(user_id="user-123")
        user = create_user(user_id="user-123")
        
        result = await job_permissions.check_job_access(job, user)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_job_access_requires_job_record(self, job_permissions, mock_permission_service):
        """Given only a job ID, when checking access, then denies access."""
        mock_permission_service.has_permission_level_method.return_value = True
        user = create_user(permission="Admin")
        
        result = await job_permissions.check_job_access("job-id-string", user)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_job_access_denies_by_default(self, job_permissions, mock_permission_service):
        """Given non-admin user with job ID, when checking, then denies."""
        mock_permission_service.has_permission_level_method.return_value = False
        user = create_user(permission="User")
        
        result = await job_permissions.check_job_access("job-id-string", user)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_user_admin_privileges_with_service(self, job_permissions, mock_permission_service):
        """Given permission service, when checking admin, then uses service."""
        mock_permission_service.has_permission_level_method.return_value = True
        user = create_user(permission="Admin")
        
        result = await job_permissions.check_user_admin_privileges(user)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_user_admin_privileges_without_service(self):
        """Given no permission service, when checking admin, then uses string check."""
        from app.services.jobs.job_permissions import JobPermissions
        
        jp = JobPermissions(permission_service=None)
        admin_user = create_user(permission="Admin")
        regular_user = create_user(permission="User")
        
        assert await jp.check_user_admin_privileges(admin_user) is True
        assert await jp.check_user_admin_privileges(regular_user) is False
    
    @pytest.mark.asyncio
    async def test_check_user_admin_privileges_handles_permissions_list(self):
        """Given permissions as list, when checking admin, then handles correctly."""
        from app.services.jobs.job_permissions import JobPermissions
        
        jp = JobPermissions(permission_service=None)
        admin_user = {"id": "user-1", "permissions": ["Admin", "Editor"]}
        regular_user = {"id": "user-2", "permissions": ["User"]}
        
        assert await jp.check_user_admin_privileges(admin_user) is True
        assert await jp.check_user_admin_privileges(regular_user) is False
    
    @pytest.mark.asyncio
    async def test_check_user_admin_privileges_returns_false_for_non_dict(self):
        """Given non-dict user, when checking admin, then returns False."""
        from app.services.jobs.job_permissions import JobPermissions
        
        jp = JobPermissions(permission_service=None)
        
        assert await jp.check_user_admin_privileges("user-string") is False
        assert await jp.check_user_admin_privileges(None) is False
