"""
Component tests for UserService (user_service.py)

Tests for user management including:
- User listing and search
- User creation and updates
- Business unit assignment
- Bulk user updates
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from typing import Dict, Any


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_user_repository():
    """Create a mock UserRepository."""
    repository = AsyncMock()
    repository.list = AsyncMock(return_value={"items": [], "total": 0})
    repository.get_by_email = AsyncMock(return_value=None)
    repository.get_by_id = AsyncMock(return_value=None)
    repository.create = AsyncMock()
    repository.update = AsyncMock()
    repository.delete = AsyncMock()
    repository.get_by_permission = AsyncMock(return_value=[])
    return repository


@pytest.fixture
def mock_prompt_service():
    """Create a mock PromptService."""
    service = AsyncMock()
    service.get_categories_by_ids = AsyncMock(return_value={})
    return service


@pytest.fixture
def user_service(mock_user_repository, mock_prompt_service):
    """Create a UserService with mocked dependencies."""
    from app.services.users.user_service import UserService
    return UserService(
        prompt_service=mock_prompt_service,
        user_repository=mock_user_repository,
    )


def create_user_dict(
    user_id: str = "user-123",
    email: str = "user@example.com",
    name: str = "Test User",
    permission: str = "User",
    business_unit_id: str = None,
    business_unit_ids: list = None,
) -> Dict[str, Any]:
    """Helper to create test user dicts."""
    user = {
        "id": user_id,
        "email": email,
        "name": name,
        "permission": permission,
        "type": "user",
        "hashed_password": "hashed_pw_here",
    }
    if business_unit_id:
        user["business_unit_id"] = business_unit_id
    if business_unit_ids:
        user["business_unit_ids"] = business_unit_ids
    return user


# ============================================================================
# TEST: list_users
# ============================================================================

class TestListUsers:
    """Tests for listing users."""
    
    @pytest.mark.asyncio
    async def test_returns_sanitized_users(self, user_service, mock_user_repository):
        """Given users in database, when listing, then returns sanitized users."""
        mock_user_repository.list.return_value = {
            "items": [
                create_user_dict("user-1", "a@test.com"),
                create_user_dict("user-2", "b@test.com"),
            ],
            "total": 2,
        }
        
        result = await user_service.list_users(limit=10, offset=0)
        
        assert len(result["items"]) == 2
        assert result["total"] == 2
        # Should not contain hashed_password
        for user in result["items"]:
            assert "hashed_password" not in user
    
    @pytest.mark.asyncio
    async def test_passes_pagination_params(self, user_service, mock_user_repository):
        """Given pagination params, when listing, then passes to repository."""
        mock_user_repository.list.return_value = {"items": [], "total": 0}
        
        await user_service.list_users(limit=25, offset=50)
        
        mock_user_repository.list.assert_called_once_with(limit=25, offset=50)


# ============================================================================
# TEST: get_user_by_email
# ============================================================================

class TestGetUserByEmail:
    """Tests for getting user by email."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found(self, user_service, mock_user_repository):
        """Given existing user, when getting by email, then returns sanitized user."""
        mock_user_repository.get_by_email.return_value = create_user_dict()
        
        result = await user_service.get_user_by_email("user@example.com")
        
        assert result is not None
        assert result["email"] == "user@example.com"
        assert "hashed_password" not in result
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, user_service, mock_user_repository):
        """Given no user, when getting by email, then returns None."""
        mock_user_repository.get_by_email.return_value = None
        
        result = await user_service.get_user_by_email("nonexistent@example.com")
        
        assert result is None


# ============================================================================
# TEST: get_user
# ============================================================================

class TestGetUser:
    """Tests for getting user by ID."""
    
    @pytest.mark.asyncio
    async def test_returns_user_when_found(self, user_service, mock_user_repository):
        """Given existing user, when getting by ID, then returns sanitized user."""
        mock_user_repository.get_by_id.return_value = create_user_dict("user-123")
        
        result = await user_service.get_user("user-123")
        
        assert result is not None
        assert result["id"] == "user-123"
        assert "hashed_password" not in result
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, user_service, mock_user_repository):
        """Given no user, when getting by ID, then returns None."""
        mock_user_repository.get_by_id.return_value = None
        
        result = await user_service.get_user("nonexistent")
        
        assert result is None


# ============================================================================
# TEST: create
# ============================================================================

class TestCreateUser:
    """Tests for creating users."""
    
    @pytest.mark.asyncio
    async def test_creates_user_successfully(self, user_service, mock_user_repository):
        """Given valid data, when creating user, then creates and returns sanitized user."""
        mock_user_repository.get_by_email.return_value = None
        mock_user_repository.create.return_value = create_user_dict(email="new@test.com")
        
        result = await user_service.create_user(
            email="new@test.com",
            password_hash="hashed_password",
            permission="User"
        )
        
        assert result is not None
        assert result["email"] == "new@test.com"
        assert "hashed_password" not in result
        mock_user_repository.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_raises_error_for_duplicate_email(self, user_service, mock_user_repository):
        """Given existing email, when creating user, then raises error."""
        from app.core.errors.domain import ApplicationError
        
        mock_user_repository.get_by_email.return_value = create_user_dict()
        
        with pytest.raises(ApplicationError) as exc_info:
            await user_service.create_user(
                email="existing@test.com",
                password_hash="password"
            )
        
        assert exc_info.value.status_code == 409
    
    @pytest.mark.asyncio
    async def test_defaults_to_user_permission(self, user_service, mock_user_repository):
        """Given no permission, when creating user, then defaults to User."""
        mock_user_repository.get_by_email.return_value = None
        mock_user_repository.create.return_value = create_user_dict()
        
        await user_service.create_user(email="test@test.com", password_hash="hash")
        
        call_args = mock_user_repository.create.call_args[0][0]
        assert call_args["permission"] == "User"


# ============================================================================
# TEST: update
# ============================================================================

class TestUpdateUser:
    """Tests for updating users."""
    
    @pytest.mark.asyncio
    async def test_updates_user_successfully(self, user_service, mock_user_repository):
        """Given valid update, when updating user, then returns updated user."""
        updated_user = create_user_dict()
        updated_user["name"] = "New Name"
        mock_user_repository.update.return_value = updated_user
        
        result = await user_service.update_user("user-123", {"name": "New Name"})
        
        assert result["name"] == "New Name"
        assert "hashed_password" not in result
    
    @pytest.mark.asyncio
    async def test_raises_error_when_user_not_found(self, user_service, mock_user_repository):
        """Given non-existent user, when updating, then raises error."""
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_user_repository.update.return_value = None
        
        with pytest.raises(ResourceNotFoundError):
            await user_service.update_user("nonexistent", {"name": "Test"})


# ============================================================================
# TEST: delete
# ============================================================================

class TestDeleteUser:
    """Tests for deleting users."""
    
    @pytest.mark.asyncio
    async def test_deletes_user_successfully(self, user_service, mock_user_repository):
        """Given existing user, when deleting, then calls cosmos delete."""
        await user_service.delete_user("user-123")
        
        mock_user_repository.delete.assert_called_once_with("user-123")


# ============================================================================
# TEST: self_assign_business_units
# ============================================================================

class TestSelfAssignBusinessUnits:
    """Tests for users self-assigning to business units."""
    
    @pytest.mark.asyncio
    async def test_assigns_business_units_to_new_user(self, user_service, mock_user_repository, mock_prompt_service):
        """Given user without BUs, when self-assigning, then assigns successfully."""
        user = create_user_dict()  # No business units
        mock_user_repository.update.return_value = {**user, "business_unit_ids": ["bu-1"]}
        mock_prompt_service.get_categories_by_ids.return_value = {
            "bu-1": {"name": "Business Unit 1"}
        }
        
        result = await user_service.self_assign_business_units(
            user=user,
            business_unit_ids=["bu-1"]
        )
        
        assert result["status"] == "success"
        assert "bu-1" in result["business_unit_ids"]
    
    @pytest.mark.asyncio
    async def test_raises_error_for_empty_business_units(self, user_service):
        """Given empty business unit list, when self-assigning, then raises error."""
        from app.core.errors.domain import ValidationError
        
        user = create_user_dict()
        
        with pytest.raises(ValidationError):
            await user_service.self_assign_business_units(
                user=user,
                business_unit_ids=[]
            )
    
    @pytest.mark.asyncio
    async def test_raises_error_if_user_already_has_business_units(self, user_service):
        """Given user with BUs, when self-assigning, then raises error."""
        from app.core.errors.domain import PermissionError
        
        user = create_user_dict(business_unit_ids=["existing-bu"])
        
        with pytest.raises(PermissionError):
            await user_service.self_assign_business_units(
                user=user,
                business_unit_ids=["new-bu"]
            )


# ============================================================================
# TEST: add_user_to_business_units
# ============================================================================

class TestAddUserToBusinessUnits:
    """Tests for adding users to business units."""
    
    @pytest.mark.asyncio
    async def test_admin_can_add_user_to_any_bu(self, user_service, mock_user_repository, mock_prompt_service):
        """Given admin user, when adding user to BU, then succeeds."""
        admin_user = create_user_dict(permission="Admin")
        target_user = create_user_dict("target-1", "target@test.com")
        
        mock_user_repository.get_by_email.return_value = target_user
        mock_user_repository.get_by_id.return_value = target_user
        mock_user_repository.update.return_value = {**target_user, "business_unit_ids": ["bu-1"]}
        mock_prompt_service.get_categories_by_ids.return_value = {"bu-1": {"name": "BU 1"}}
        
        result = await user_service.add_user_to_business_units(
            current_user=admin_user,
            user_email="target@test.com",
            business_unit_ids=["bu-1"]
        )
        
        assert "user" in result
    
    @pytest.mark.asyncio
    async def test_editor_can_only_add_to_own_bus(self, user_service, mock_user_repository):
        """Given editor user, when adding user to other BU, then raises error."""
        from app.core.errors.domain import PermissionError
        
        editor_user = create_user_dict(permission="Editor", business_unit_ids=["bu-1"])
        target_user = create_user_dict("target-1", "target@test.com")
        
        mock_user_repository.get_by_email.return_value = target_user
        mock_user_repository.get_by_id.return_value = target_user
        mock_user_repository.update.return_value = target_user
        
        with pytest.raises(PermissionError):
            await user_service.add_user_to_business_units(
                current_user=editor_user,
                user_email="target@test.com",
                business_unit_ids=["bu-2"]  # Not in editor's BUs
            )
    
    @pytest.mark.asyncio
    async def test_user_cannot_add_users(self, user_service, mock_user_repository):
        """Given regular user, when adding user to BU, then raises error."""
        from app.core.errors.domain import PermissionError
        
        regular_user = create_user_dict(permission="User")
        target_user = create_user_dict("target-1", "target@test.com")
        
        # Mock user retrieval to ensure we don't fail on ResourceNotFoundError
        # if the permission check incorrectly passes
        mock_user_repository.get_by_email.return_value = target_user
        mock_user_repository.get_by_id.return_value = target_user
        mock_user_repository.update.return_value = target_user
        
        with pytest.raises(PermissionError):
            await user_service.add_user_to_business_units(
                current_user=regular_user,
                user_email="target@test.com",
                business_unit_ids=["bu-1"]
            )


# ============================================================================
# TEST: _sanitize_user
# ============================================================================

class TestSanitizeUser:
    """Tests for user sanitization."""
    
    def test_removes_hashed_password(self, user_service):
        """Given user with password, when sanitizing, then removes it."""
        user = create_user_dict()
        
        result = user_service._sanitize_user(user)
        
        assert "hashed_password" not in result
    
    def test_returns_none_for_none_input(self, user_service):
        """Given None, when sanitizing, then returns None."""
        result = user_service._sanitize_user(None)
        
        assert result is None
    
    def test_preserves_other_fields(self, user_service):
        """Given user with fields, when sanitizing, then preserves them."""
        user = create_user_dict()
        user["custom_field"] = "custom_value"
        
        result = user_service._sanitize_user(user)
        
        assert result["email"] == user["email"]
        assert result["custom_field"] == "custom_value"


# ============================================================================
# TEST: _normalize_business_units
# ============================================================================

class TestNormalizeBusinessUnits:
    """Tests for business unit normalization."""
    
    def test_returns_empty_list_for_none_user(self, user_service):
        """Given None user, when normalizing, then returns empty list."""
        result = user_service._normalize_business_units(None)
        
        assert result == []
    
    def test_returns_business_unit_ids_when_present(self, user_service):
        """Given user with business_unit_ids, when normalizing, then returns them."""
        user = create_user_dict(business_unit_ids=["bu-1", "bu-2"])
        
        result = user_service._normalize_business_units(user)
        
        assert result == ["bu-1", "bu-2"]
    
    def test_ignores_legacy_single_business_unit(self, user_service):
        """Given user with only legacy business_unit_id, when normalizing, then returns empty list."""
        user = create_user_dict(business_unit_id="bu-1")

        result = user_service._normalize_business_units(user)

        assert result == []
    
    def test_filters_out_empty_values(self, user_service):
        """Given user with empty BU values, when normalizing, then filters them."""
        user = {"business_unit_ids": ["bu-1", "", None, "bu-2"]}
        
        result = user_service._normalize_business_units(user)
        
        assert "" not in result
        assert None not in result
