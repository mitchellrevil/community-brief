"""
Unit and Component tests for PermissionService (permission_service.py)

Tests for permission checks including:
- User permission retrieval and caching
- Business unit access control
- Category and prompt editing permissions
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from typing import Dict, Any
from app.models.permissions import PermissionLevel


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_permission_cache():
    """Create a mock permission cache."""
    cache = AsyncMock()
    cache.get_user_permission = AsyncMock(return_value=None)
    cache.set_user_permission = AsyncMock()
    return cache


@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    repository = AsyncMock()
    repository.get_by_id = AsyncMock(return_value=None)
    repository.get_by_permission = AsyncMock(return_value=[])
    return repository


@pytest.fixture
def mock_prompt_service():
    """Create a mock PromptService."""
    service = AsyncMock()
    service.get_business_unit_id_from_category = AsyncMock(return_value="business-unit-1")
    return service


@pytest.fixture
def permission_service(mock_permission_cache, mock_user_repository, mock_prompt_service):
    """Create a PermissionService with mocked dependencies."""
    from app.services.auth.permission_service import PermissionService
    
    service = PermissionService(
        permission_cache=mock_permission_cache,
        user_repository=mock_user_repository,
    )
    service.set_prompt_service(mock_prompt_service)
    
    return service


def create_user(
    user_id: str = "user-123",
    permission: str = "User",
    business_unit_ids: list = None,
) -> Dict[str, Any]:
    """Helper to create test user dicts."""
    user = {
        "id": user_id,
        "permission": permission,
    }
    if business_unit_ids:
        user["business_unit_ids"] = business_unit_ids
    return user


# ============================================================================
# TEST: __init__ and set methods
# ============================================================================

class TestPermissionServiceInit:
    """Tests for PermissionService initialization."""
    
    def test_set_user_repository_returns_self(self, permission_service, mock_user_repository):
        """Given user repository, when setting, then returns self for chaining."""
        result = permission_service.set_user_repository(mock_user_repository)
        
        assert result is permission_service
    
    def test_set_permission_cache_returns_self(self, permission_service, mock_permission_cache):
        """Given cache, when setting, then returns self for chaining."""
        result = permission_service.set_permission_cache(mock_permission_cache)
        
        assert result is permission_service
    
    def test_set_prompt_service_returns_self(self, permission_service, mock_prompt_service):
        """Given prompt service, when setting, then returns self for chaining."""
        result = permission_service.set_prompt_service(mock_prompt_service)
        
        assert result is permission_service


# ============================================================================
# TEST: get_user_permission
# ============================================================================

class TestGetUserPermission:
    """Tests for getting user permission levels."""
    
    @pytest.mark.asyncio
    async def test_returns_none_without_user_repository(self, mock_permission_cache):
        """Given no user repository, when getting permission, then returns None."""
        from app.services.auth.permission_service import PermissionService
        
        service = PermissionService(permission_cache=mock_permission_cache)
        
        result = await service.get_user_permission("user-123")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_user_id(self, permission_service):
        """Given empty user_id, when getting permission, then returns None."""
        result = await permission_service.get_user_permission("")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_cached_permission(self, permission_service, mock_permission_cache):
        """Given cached permission, when getting permission, then returns from cache."""
        mock_permission_cache.get_user_permission.return_value = "Admin"
        
        result = await permission_service.get_user_permission("user-123")
        
        assert result == "Admin"
    
    @pytest.mark.asyncio
    async def test_fetches_from_repository_when_not_cached(
        self,
        permission_service,
        mock_user_repository,
        mock_permission_cache,
    ):
        """Given no cached permission, when getting permission, then fetches from repository."""
        mock_permission_cache.get_user_permission.return_value = None
        mock_user_repository.get_by_id.return_value = {"id": "user-123", "permission": "Editor"}
        
        result = await permission_service.get_user_permission("user-123")
        
        assert result == "Editor"
        mock_user_repository.get_by_id.assert_called_once_with("user-123")
    
    @pytest.mark.asyncio
    async def test_caches_fetched_permission(self, permission_service, mock_user_repository, mock_permission_cache):
        """Given fetched permission, when getting permission, then caches it."""
        mock_permission_cache.get_user_permission.return_value = None
        mock_user_repository.get_by_id.return_value = {"id": "user-123", "permission": "User"}
        
        await permission_service.get_user_permission("user-123")
        
        mock_permission_cache.set_user_permission.assert_called_once_with("user-123", "User")
    
    @pytest.mark.asyncio
    async def test_returns_none_when_user_not_found(self, permission_service, mock_user_repository, mock_permission_cache):
        """Given user not in repository, when getting permission, then returns None."""
        mock_permission_cache.get_user_permission.return_value = None
        mock_user_repository.get_by_id.return_value = None
        
        result = await permission_service.get_user_permission("nonexistent-user")
        
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_permission_lookup_runtime_error_occurs(
        self,
        permission_service,
        mock_permission_cache,
    ):
        """Given cache failure, when getting permission, then soft-fails."""
        mock_permission_cache.get_user_permission.side_effect = RuntimeError("cache unavailable")

        result = await permission_service.get_user_permission("user-123")

        assert result is None


# ============================================================================
# TEST: get_users_by_permission
# ============================================================================

class TestGetUsersByPermission:
    """Tests for getting users by permission level."""
    
    @pytest.mark.asyncio
    async def test_returns_empty_list_without_user_repository(self, mock_permission_cache):
        """Given no user repository, when getting users, then returns empty list."""
        from app.services.auth.permission_service import PermissionService
        
        service = PermissionService(permission_cache=mock_permission_cache)
        
        result = await service.get_users_by_permission("Admin")
        
        assert result == []
    
    @pytest.mark.asyncio
    async def test_returns_users_with_permission(self, permission_service, mock_user_repository):
        """Given users with permission, when getting users, then returns them."""
        mock_user_repository.get_by_permission.return_value = [
            {"id": "user-1", "permission": "Admin"},
            {"id": "user-2", "permission": "Admin"},
        ]
        
        result = await permission_service.get_users_by_permission("Admin")
        
        assert len(result) == 2
    
    @pytest.mark.asyncio
    async def test_passes_limit_parameter(self, permission_service, mock_user_repository):
        """Given limit parameter, when getting users, then passes to repository."""
        await permission_service.get_users_by_permission("Editor", limit=5)
        
        mock_user_repository.get_by_permission.assert_called_once_with("Editor", limit=5)

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_users_by_permission_runtime_error_occurs(
        self,
        permission_service,
        mock_user_repository,
    ):
        """Given repository failure, when listing by permission, then soft-fails."""
        mock_user_repository.get_by_permission.side_effect = RuntimeError("repository unavailable")

        result = await permission_service.get_users_by_permission("Editor")

        assert result == []


# ============================================================================
# TEST: has_permission_level_method
# ============================================================================

class TestHasPermissionLevelMethod:
    """Tests for checking permission levels."""
    
    def test_returns_false_for_empty_permission(self, permission_service):
        """Given empty permission, when checking level, then returns False."""
        from app.models.permissions import PermissionLevel
        
        result = permission_service.has_permission_level_method("", PermissionLevel.USER)
        
        assert result is False
    
    def test_admin_has_user_level(self, permission_service):
        """Given Admin permission, when checking User level, then returns True."""
        from app.models.permissions import PermissionLevel
        
        result = permission_service.has_permission_level_method("Admin", PermissionLevel.USER)
        
        assert result is True
    
    def test_user_does_not_have_admin_level(self, permission_service):
        """Given User permission, when checking Admin level, then returns False."""
        from app.models.permissions import PermissionLevel
        
        result = permission_service.has_permission_level_method("User", PermissionLevel.ADMIN)
        
        assert result is False
    
    def test_editor_has_user_level(self, permission_service):
        """Given Editor permission, when checking User level, then returns True."""
        from app.models.permissions import PermissionLevel
        
        result = permission_service.has_permission_level_method("Editor", PermissionLevel.USER)
        
        assert result is True


class TestRoleHierarchy:
    """Tests around new role-based hierarchy (includes Moderator)."""

    def test_moderator_has_admin_level_access(self, permission_service):
        user = create_user(permission="Moderator")

        assert permission_service.has_permission_level_method("Moderator", PermissionLevel.ADMIN)

    @pytest.mark.asyncio
    async def test_moderator_can_edit_any_category_and_prompt(self, permission_service):
        user = create_user(permission="Moderator")
        category = {"id": "cat-1", "type": "prompt_category", "business_unit_id": "bu-1"}
        prompt = {"id": "prompt-1", "category_id": "cat-1"}

        assert await permission_service.can_edit_category(user, category) is True
        assert await permission_service.can_edit_prompt(user, prompt) is True


# ============================================================================
# TEST: has_business_unit_access
# ============================================================================

class TestHasBusinessUnitAccess:
    """Tests for business unit access checking."""
    
    def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking access, then returns False."""
        result = permission_service.has_business_unit_access(None, "bu-1")
        
        assert result is False
    
    def test_admin_has_access_to_all_business_units(self, permission_service):
        """Given Admin user, when checking any BU, then returns True."""
        user = create_user(permission="Admin")
        
        result = permission_service.has_business_unit_access(user, "any-bu")
        
        assert result is True
    
    def test_user_has_access_to_own_business_unit(self, permission_service):
        """Given user with BU, when checking same BU, then returns True."""
        user = create_user(permission="User", business_unit_ids=["bu-1"])
        
        result = permission_service.has_business_unit_access(user, "bu-1")
        
        assert result is True
    
    def test_user_denied_access_to_other_business_unit(self, permission_service):
        """Given user with BU, when checking different BU, then returns False."""
        user = create_user(permission="User", business_unit_ids=["bu-1"])
        
        result = permission_service.has_business_unit_access(user, "bu-2")
        
        assert result is False
    
    def test_user_with_multiple_business_units(self, permission_service):
        """Given user with multiple BUs, when checking listed BU, then returns True."""
        user = create_user(permission="User", business_unit_ids=["bu-1", "bu-2", "bu-3"])
        
        assert permission_service.has_business_unit_access(user, "bu-1") is True
        assert permission_service.has_business_unit_access(user, "bu-2") is True
        assert permission_service.has_business_unit_access(user, "bu-4") is False


# ============================================================================
# TEST: can_edit_category
# ============================================================================

class TestCanEditCategory:
    """Tests for category editing permission checks."""
    
    @pytest.mark.asyncio
    async def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking edit permission, then returns False."""
        category = {"id": "cat-1", "type": "prompt_category"}
        
        result = await permission_service.can_edit_category(None, category)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_returns_false_for_none_category(self, permission_service):
        """Given None category, when checking edit permission, then returns False."""
        user = create_user(permission="Admin")
        
        result = await permission_service.can_edit_category(user, None)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_admin_can_edit_any_category(self, permission_service):
        """Given Admin user, when checking any category, then returns True."""
        user = create_user(permission="Admin")
        category = {"id": "cat-1", "type": "prompt_category", "business_unit_id": "bu-1"}
        
        result = await permission_service.can_edit_category(user, category)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_editor_can_edit_own_bu_category(self, permission_service, mock_prompt_service):
        """Given Editor in BU, when checking own BU category, then returns True."""
        user = create_user(permission="Editor", business_unit_ids=["bu-1"])
        category = {"id": "cat-1", "type": "prompt_category", "business_unit_id": "bu-1"}
        
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-1"
        
        result = await permission_service.can_edit_category(user, category)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_editor_cannot_edit_other_bu_category(self, permission_service, mock_prompt_service):
        """Given Editor in BU, when checking other BU category, then returns False."""
        user = create_user(permission="Editor", business_unit_ids=["bu-1"])
        category = {"id": "cat-1", "type": "prompt_category", "business_unit_id": "bu-2"}
        
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-2"
        
        result = await permission_service.can_edit_category(user, category)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_user_cannot_edit_category(self, permission_service):
        """Given User permission, when checking any category, then returns False."""
        user = create_user(permission="User", business_unit_ids=["bu-1"])
        category = {"id": "cat-1", "type": "prompt_category", "business_unit_id": "bu-1"}
        
        result = await permission_service.can_edit_category(user, category)
        
        assert result is False


# ============================================================================
# TEST: can_edit_prompt
# ============================================================================

class TestCanEditPrompt:
    """Tests for prompt editing permission checks."""
    
    @pytest.mark.asyncio
    async def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking edit permission, then returns False."""
        prompt = {"id": "prompt-1", "category_id": "cat-1"}
        
        result = await permission_service.can_edit_prompt(None, prompt)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_returns_false_for_none_prompt(self, permission_service):
        """Given None prompt, when checking edit permission, then returns False."""
        user = create_user(permission="Admin")
        
        result = await permission_service.can_edit_prompt(user, None)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_admin_can_edit_any_prompt(self, permission_service):
        """Given Admin user, when checking any prompt, then returns True."""
        user = create_user(permission="Admin")
        prompt = {"id": "prompt-1", "category_id": "cat-1"}
        
        result = await permission_service.can_edit_prompt(user, prompt)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_editor_can_edit_own_bu_prompt(self, permission_service, mock_prompt_service):
        """Given Editor in BU, when checking own BU prompt, then returns True."""
        user = create_user(permission="Editor", business_unit_ids=["bu-1"])
        prompt = {"id": "prompt-1", "category_id": "cat-1"}
        
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-1"
        
        result = await permission_service.can_edit_prompt(user, prompt)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_user_cannot_edit_prompt(self, permission_service):
        """Given User permission, when checking any prompt, then returns False."""
        user = create_user(permission="User", business_unit_ids=["bu-1"])
        prompt = {"id": "prompt-1", "category_id": "cat-1"}
        
        result = await permission_service.can_edit_prompt(user, prompt)
        
        assert result is False


# ============================================================================
# TEST: can_assign_user_to_business_unit
# ============================================================================

class TestCanAssignUserToBusinessUnit:
    """Tests for user assignment permission checks."""
    
    def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking assignment permission, then returns False."""
        result = permission_service.can_assign_user_to_business_unit(None)
        
        assert result is False
    
    def test_admin_can_assign_users(self, permission_service):
        """Given Admin user, when checking assignment, then returns True."""
        user = create_user(permission="Admin")
        
        result = permission_service.can_assign_user_to_business_unit(user)
        
        assert result is True
    
    def test_editor_cannot_assign_users(self, permission_service):
        """Given Editor user, when checking assignment, then returns False."""
        user = create_user(permission="Editor")
        
        result = permission_service.can_assign_user_to_business_unit(user)
        
        assert result is False
    
    def test_user_cannot_assign_users(self, permission_service):
        """Given User permission, when checking assignment, then returns False."""
        user = create_user(permission="User")
        
        result = permission_service.can_assign_user_to_business_unit(user)
        
        assert result is False


# ============================================================================
# TEST: can_manage_business_units
# ============================================================================

class TestCanManageBusinessUnits:
    """Tests for business unit management permission checks."""
    
    def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking management permission, then returns False."""
        result = permission_service.can_manage_business_units(None)
        
        assert result is False
    
    def test_admin_can_manage_business_units(self, permission_service):
        """Given Admin user, when checking management, then returns True."""
        user = create_user(permission="Admin")
        
        result = permission_service.can_manage_business_units(user)
        
        assert result is True
    
    def test_editor_cannot_manage_business_units(self, permission_service):
        """Given Editor user, when checking management, then returns False."""
        user = create_user(permission="Editor")
        
        result = permission_service.can_manage_business_units(user)
        
        assert result is False


# ============================================================================
# TEST: can_view_all_business_units_analytics
# ============================================================================

class TestCanViewAllBusinessUnitsAnalytics:
    """Tests for analytics visibility permission checks."""
    
    def test_returns_false_for_none_user(self, permission_service):
        """Given None user, when checking analytics permission, then returns False."""
        result = permission_service.can_view_all_business_units_analytics(None)
        
        assert result is False
    
    def test_admin_can_view_all_analytics(self, permission_service):
        """Given Admin user, when checking analytics, then returns True."""
        user = create_user(permission="Admin")
        
        result = permission_service.can_view_all_business_units_analytics(user)
        
        assert result is True
    
    def test_editor_cannot_view_all_analytics(self, permission_service):
        """Given Editor user, when checking analytics, then returns False."""
        user = create_user(permission="Editor")
        
        result = permission_service.can_view_all_business_units_analytics(user)
        
        assert result is False


# ============================================================================
# TEST: _derive_business_unit_id
# ============================================================================

class TestDeriveBusinessUnitId:
    """Tests for business unit ID derivation."""
    
    @pytest.mark.asyncio
    async def test_returns_none_for_none_item(self, permission_service):
        """Given None item, when deriving BU ID, then returns None."""
        result = await permission_service._derive_business_unit_id(None)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_existing_business_unit_id(self, permission_service):
        """Given item with business_unit_id, when deriving, then returns it."""
        item = {"id": "cat-1", "business_unit_id": "bu-1"}
        
        result = await permission_service._derive_business_unit_id(item)
        
        assert result == "bu-1"

    @pytest.mark.asyncio
    async def test_subcategory_prefers_category_hierarchy_over_stale_business_unit_id(self, permission_service, mock_prompt_service):
        """Given subcategory with stale business_unit_id, when deriving, then category hierarchy wins."""
        item = {
            "id": "subcat-1",
            "category_id": "cat-1",
            "business_unit_id": "stale-bu",
        }
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-1"

        result = await permission_service._derive_business_unit_id(item)

        assert result == "bu-1"
        mock_prompt_service.get_business_unit_id_from_category.assert_called_once_with("cat-1")
    
    @pytest.mark.asyncio
    async def test_top_level_category_uses_own_id(self, permission_service):
        """Given top-level category, when deriving BU ID, then returns own ID."""
        item = {
            "id": "cat-1",
            "type": "prompt_category",
            "parent_category_id": None,
        }
        
        result = await permission_service._derive_business_unit_id(item)
        
        assert result == "cat-1"
    
    @pytest.mark.asyncio
    async def test_nested_category_uses_prompt_service(self, permission_service, mock_prompt_service):
        """Given nested category, when deriving BU ID, then uses prompt service."""
        item = {
            "id": "cat-nested",
            "type": "prompt_category",
            "parent_category_id": "cat-parent",
        }
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-root"
        
        result = await permission_service._derive_business_unit_id(item)
        
        assert result == "bu-root"
        mock_prompt_service.get_business_unit_id_from_category.assert_called_once_with("cat-nested")
    
    @pytest.mark.asyncio
    async def test_subcategory_uses_prompt_service(self, permission_service, mock_prompt_service):
        """Given subcategory, when deriving BU ID, then uses prompt service."""
        item = {
            "id": "subcat-1",
            "category_id": "cat-1",
        }
        mock_prompt_service.get_business_unit_id_from_category.return_value = "bu-1"
        
        result = await permission_service._derive_business_unit_id(item)
        
        assert result == "bu-1"


# ============================================================================
# TEST: close
# ============================================================================

class TestClose:
    """Tests for service cleanup."""
    
    def test_close_is_noop(self, permission_service):
        """Given service, when closing, then no error is raised."""
        # Should not raise
        permission_service.close()
