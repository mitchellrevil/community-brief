"""
Unit tests for permissions.py (core)

Tests for permission context and dependency functions including:
- PermissionContext dataclass
- get_permission_context
- require_permission
- create_permission_dependency
- require_admin, require_editor, require_user
- require_analytics_access
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException

from app.core.auth import (
    PermissionContext,
    get_permission_context,
    require_permission,
    create_permission_dependency,
    require_admin,
    require_editor,
    require_user,
)
from app.models.permissions import PermissionLevel


# Mark all tests as unit tests
pytestmark = pytest.mark.unit


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_request():
    """Create a mock Request object."""
    request = MagicMock()
    request.state = MagicMock()
    # Simulate no cached permission context
    del request.state.permission_context
    return request


@pytest.fixture
def admin_user():
    """Create an admin user dict."""
    return {
        "id": "admin_123",
        "email": "admin@example.com",
        "permission": "Admin",
    }


@pytest.fixture
def editor_user():
    """Create an editor user dict."""
    return {
        "id": "editor_123",
        "email": "editor@example.com",
        "permission": "Editor",
    }


@pytest.fixture
def viewer_user():
    """Create a viewer/user level user dict."""
    return {
        "id": "user_123",
        "email": "user@example.com",
        "permission": "User",
    }


# ============================================================================
# TEST: PermissionContext
# ============================================================================

class TestPermissionContext:
    """Tests for PermissionContext dataclass."""
    
    def test_user_id_property(self, admin_user):
        """Given user with id, when accessing user_id, then returns id."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        assert ctx.user_id == "admin_123"
    
    def test_email_property(self, admin_user):
        """Given user with email, when accessing email, then returns email."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        assert ctx.email == "admin@example.com"
    
    def test_user_id_returns_empty_when_missing(self):
        """Given user without id, when accessing user_id, then returns empty string."""
        ctx = PermissionContext(
            user={},
            permission_level=0,
            permission_str="User",
        )
        
        assert ctx.user_id == ""
    
    def test_email_returns_empty_when_missing(self):
        """Given user without email, when accessing email, then returns empty string."""
        ctx = PermissionContext(
            user={},
            permission_level=0,
            permission_str="User",
        )
        
        assert ctx.email == ""
    
    def test_is_admin_defaults_to_false(self, viewer_user):
        """Given no is_admin set, when creating context, then defaults to False."""
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
        )
        
        assert ctx.is_admin is False
    
    def test_is_editor_defaults_to_false(self, viewer_user):
        """Given no is_editor set, when creating context, then defaults to False."""
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
        )
        
        assert ctx.is_editor is False


# ============================================================================
# TEST: get_permission_context
# ============================================================================

class TestGetPermissionContext:
    """Tests for get_permission_context dependency."""
    
    @pytest.mark.asyncio
    async def test_creates_context_for_admin(self, mock_request, admin_user):
        """Given admin user, when getting context, then is_admin is True."""
        result = await get_permission_context(mock_request, admin_user)
        
        assert result.is_admin is True
        assert result.is_editor is True
        assert result.permission_str == "Admin"
    
    @pytest.mark.asyncio
    async def test_creates_context_for_editor(self, mock_request, editor_user):
        """Given editor user, when getting context, then is_editor is True."""
        result = await get_permission_context(mock_request, editor_user)
        
        assert result.is_admin is False
        assert result.is_editor is True
        assert result.permission_str == "Editor"
    
    @pytest.mark.asyncio
    async def test_creates_context_for_user(self, mock_request, viewer_user):
        """Given viewer user, when getting context, then both flags are False."""
        result = await get_permission_context(mock_request, viewer_user)
        
        assert result.is_admin is False
        assert result.is_editor is False
        assert result.permission_str == "User"
    
    @pytest.mark.asyncio
    async def test_memoizes_context_in_request_state(self, mock_request, admin_user):
        """Given first call, when getting context, then caches in request state."""
        result = await get_permission_context(mock_request, admin_user)
        
        assert mock_request.state.permission_context is result
    
    @pytest.mark.asyncio
    async def test_returns_cached_context(self, mock_request, admin_user):
        """Given cached context, when getting again, then returns cached."""
        cached_ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        mock_request.state.permission_context = cached_ctx
        
        result = await get_permission_context(mock_request, admin_user)
        
        assert result is cached_ctx


# ============================================================================
# TEST: require_permission
# ============================================================================

class TestRequirePermission:
    """Tests for require_permission dependency."""
    
    @pytest.mark.asyncio
    async def test_passes_when_user_has_required_permission(self, admin_user):
        """Given admin user, when requiring user permission, then passes."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        result = await require_permission(PermissionLevel.USER, ctx)
        
        assert result == admin_user
    
    @pytest.mark.asyncio
    async def test_raises_403_when_insufficient_permission(self, viewer_user):
        """Given viewer user, when requiring admin, then raises 403."""
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
            is_admin=False,
            is_editor=False,
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await require_permission(PermissionLevel.ADMIN, ctx)
        
        assert exc_info.value.status_code == 403
        assert "Insufficient permissions" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_returns_user_on_success(self, admin_user):
        """Given sufficient permission, when requiring, then returns user dict."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        result = await require_permission(PermissionLevel.ADMIN, ctx)
        
        assert result["id"] == "admin_123"


# ============================================================================
# TEST: create_permission_dependency
# ============================================================================

class TestCreatePermissionDependency:
    """Tests for create_permission_dependency factory."""
    
    def test_creates_callable_dependency(self):
        """Given permission level, when creating dependency, then returns callable."""
        dependency = create_permission_dependency(PermissionLevel.EDITOR)
        
        assert callable(dependency)
    
    @pytest.mark.asyncio
    async def test_created_dependency_checks_permission(self, editor_user):
        """Given editor dependency, when user has permission, then passes."""
        dependency = create_permission_dependency(PermissionLevel.EDITOR)
        ctx = PermissionContext(
            user=editor_user,
            permission_level=50,
            permission_str="Editor",
            is_admin=False,
            is_editor=True,
        )
        
        result = await dependency(ctx)
        
        assert result == editor_user
    
    @pytest.mark.asyncio
    async def test_created_dependency_raises_when_insufficient(self, viewer_user):
        """Given admin dependency, when user lacks permission, then raises 403."""
        dependency = create_permission_dependency(PermissionLevel.ADMIN)
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
            is_admin=False,
            is_editor=False,
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await dependency(ctx)
        
        assert exc_info.value.status_code == 403


# ============================================================================
# TEST: require_admin
# ============================================================================

class TestRequireAdmin:
    """Tests for require_admin dependency."""
    
    @pytest.mark.asyncio
    async def test_passes_for_admin(self, admin_user):
        """Given admin user, when requiring admin, then passes."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        result = await require_admin(ctx)
        
        assert result == admin_user
    
    @pytest.mark.asyncio
    async def test_raises_for_editor(self, editor_user):
        """Given editor user, when requiring admin, then raises 403."""
        ctx = PermissionContext(
            user=editor_user,
            permission_level=50,
            permission_str="Editor",
            is_admin=False,
            is_editor=True,
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(ctx)
        
        assert exc_info.value.status_code == 403


# ============================================================================
# TEST: require_editor
# ============================================================================

class TestRequireEditor:
    """Tests for require_editor dependency."""
    
    @pytest.mark.asyncio
    async def test_passes_for_editor(self, editor_user):
        """Given editor user, when requiring editor, then passes."""
        ctx = PermissionContext(
            user=editor_user,
            permission_level=50,
            permission_str="Editor",
            is_admin=False,
            is_editor=True,
        )
        
        result = await require_editor(ctx)
        
        assert result == editor_user
    
    @pytest.mark.asyncio
    async def test_passes_for_admin(self, admin_user):
        """Given admin user, when requiring editor, then passes."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        result = await require_editor(ctx)
        
        assert result == admin_user
    
    @pytest.mark.asyncio
    async def test_raises_for_user(self, viewer_user):
        """Given viewer user, when requiring editor, then raises 403."""
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
            is_admin=False,
            is_editor=False,
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await require_editor(ctx)
        
        assert exc_info.value.status_code == 403


# ============================================================================
# TEST: require_user
# ============================================================================

class TestRequireUser:
    """Tests for require_user dependency."""
    
    @pytest.mark.asyncio
    async def test_passes_for_user(self, viewer_user):
        """Given viewer user, when requiring user, then passes."""
        ctx = PermissionContext(
            user=viewer_user,
            permission_level=0,
            permission_str="User",
            is_admin=False,
            is_editor=False,
        )
        
        result = await require_user(ctx)
        
        assert result == viewer_user
    
    @pytest.mark.asyncio
    async def test_passes_for_admin(self, admin_user):
        """Given admin user, when requiring user, then passes."""
        ctx = PermissionContext(
            user=admin_user,
            permission_level=100,
            permission_str="Admin",
            is_admin=True,
            is_editor=True,
        )
        
        result = await require_user(ctx)
        
        assert result == admin_user
