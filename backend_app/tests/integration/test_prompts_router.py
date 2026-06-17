"""
Integration tests for prompts router (prompts.py)

Tests for prompts API endpoints including:
- Category CRUD operations
- Subcategory CRUD operations
- Talking points validation
- Permission-based access control
- Retrieve prompts hierarchy
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any
from datetime import datetime, timezone


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
        "permission": "Editor",
        "business_unit_ids": ["bu_123"],
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
def mock_prompt_service():
    """Create a mock PromptService."""
    service = AsyncMock()
    service.create_category = AsyncMock()
    service.list_categories = AsyncMock()
    service.get_category = AsyncMock()
    service.update_category = AsyncMock()
    service.delete_category_and_subcategories = AsyncMock()
    service.create_subcategory = AsyncMock()
    service.list_subcategories = AsyncMock()
    service.get_subcategory = AsyncMock()
    service.update_subcategory = AsyncMock()
    service.move_subcategory = AsyncMock()
    service.delete_subcategory = AsyncMock()
    service.retrieve_prompts_hierarchy = AsyncMock()
    return service


@pytest.fixture
def mock_permission_service():
    """Create a mock PermissionService."""
    service = MagicMock()
    service.set_prompt_service = MagicMock()
    service.can_manage_business_units = MagicMock(return_value=False)
    service.can_edit_category = AsyncMock(return_value=True)
    service.can_edit_prompt = AsyncMock(return_value=True)
    return service


@pytest.fixture
def mock_user_service():
    """Create a mock UserService."""
    service = AsyncMock()
    service.refresh_business_unit_names = AsyncMock(return_value=1)
    service.remove_business_unit_from_users = AsyncMock(return_value=1)
    return service


@pytest.fixture
def mock_talking_points_service():
    """Create a mock TalkingPointsService."""
    service = MagicMock()
    service.validate_talking_points_structure = MagicMock(return_value=[])
    service.convert_talking_points_to_response = MagicMock(return_value=[])
    service.normalize_talking_points_sections = MagicMock(return_value=[])
    service.ensure_talking_points_structure = MagicMock(side_effect=lambda x: x)
    return service


@pytest.fixture
def mock_error_handler():
    """Create a mock ErrorHandler."""
    from fastapi import HTTPException
    handler = MagicMock()
    handler.raise_internal = MagicMock(side_effect=HTTPException(status_code=500, detail="Internal Error"))
    return handler


def create_category(
    category_id: str = "cat_123",
    name: str = "Test Category",
    parent_category_id: str = None,
) -> Dict[str, Any]:
    """Helper to create test category dicts."""
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {
        "id": category_id,
        "name": name,
        "parent_category_id": parent_category_id,
        "created_at": now,
        "updated_at": now,
    }


def create_subcategory(
    subcategory_id: str = "sub_123",
    category_id: str = "cat_123",
    name: str = "Test Subcategory",
) -> Dict[str, Any]:
    """Helper to create test subcategory dicts."""
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {
        "id": subcategory_id,
        "category_id": category_id,
        "name": name,
        "prompts": {"system": "Test prompt"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "created_at": now,
        "updated_at": now,
    }


# ============================================================================
# TEST: POST /categories
# ============================================================================

class TestCreateCategory:
    """Tests for creating categories endpoint."""
    
    @pytest.mark.asyncio
    async def test_creates_category_under_parent(
        self, mock_current_user, mock_prompt_service, mock_permission_service, mock_error_handler
    ):
        """Given valid parent category, when creating category, then creates."""
        from app.api.v1.routes.prompts import create_category
        from app.schemas.prompts import CategoryCreate
        
        parent_cat = create_category(category_id="parent_cat")
        mock_prompt_service.get_category.return_value = parent_cat
        mock_prompt_service.create_category.return_value = create_category(parent_category_id="parent_cat")
        
        category_create = CategoryCreate(name="New Category", parent_category_id="parent_cat")
        
        result = await create_category(
            category=category_create,
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            error_handler=mock_error_handler,
        )
        
        assert result["name"] == "Test Category"
        mock_prompt_service.create_category.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_admin_can_create_top_level_category(
        self, mock_admin_user, mock_prompt_service, mock_permission_service, mock_error_handler
    ):
        """Given admin user, when creating top-level category, then creates."""
        from app.api.v1.routes.prompts import create_category
        from app.schemas.prompts import CategoryCreate
        
        mock_permission_service.can_manage_business_units.return_value = True
        mock_prompt_service.create_category.return_value = create_category()
        
        category_create = CategoryCreate(name="Top Level", parent_category_id=None)
        
        result = await create_category(
            category=category_create,
            current_user=mock_admin_user,
            auth_context="admin",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            error_handler=mock_error_handler,
        )
        
        assert result is not None
    
    @pytest.mark.asyncio
    async def test_non_admin_cannot_create_top_level_category(
        self, mock_current_user, mock_prompt_service, mock_permission_service, mock_error_handler
    ):
        """Given non-admin user, when creating top-level category, then raises 403."""
        from app.api.v1.routes.prompts import create_category
        from app.schemas.prompts import CategoryCreate
        from app.core.errors.domain import ApplicationError
        
        mock_permission_service.can_manage_business_units.return_value = False
        
        category_create = CategoryCreate(name="Top Level", parent_category_id=None)
        
        with pytest.raises(ApplicationError) as exc_info:
            await create_category(
                category=category_create,
                current_user=mock_current_user,
                auth_context="editor",
                prompt_service=mock_prompt_service,
                perm_service=mock_permission_service,
                error_handler=mock_error_handler,
            )
        
        assert exc_info.value.status_code == 403


# ============================================================================
# TEST: GET /categories
# ============================================================================

class TestListCategories:
    """Tests for listing categories endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_paginated_categories(
        self, mock_current_user, mock_prompt_service, mock_error_handler
    ):
        """Given categories exist, when listing, then returns paginated result."""
        from app.api.v1.routes.prompts import list_categories
        
        mock_prompt_service.list_categories.return_value = {
            "items": [create_category()],
            "total": 1,
        }
        
        result = await list_categories(
            limit=50,
            offset=0,
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            error_handler=mock_error_handler,
        )
        
        assert "categories" in result
        assert result["total"] == 1
        assert result["has_more"] is False


# ============================================================================
# TEST: GET /categories/{category_id}
# ============================================================================

class TestGetCategory:
    """Tests for getting a specific category endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_category_when_found(
        self, mock_current_user, mock_prompt_service, mock_error_handler
    ):
        """Given existing category, when getting, then returns category."""
        from app.api.v1.routes.prompts import get_category
        
        mock_prompt_service.get_category.return_value = create_category()
        
        result = await get_category(
            category_id="cat_123",
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            error_handler=mock_error_handler,
        )
        
        assert result["id"] == "cat_123"
    
    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(
        self, mock_current_user, mock_prompt_service, mock_error_handler
    ):
        """Given nonexistent category, when getting, then raises 404."""
        from app.api.v1.routes.prompts import get_category
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_prompt_service.get_category.return_value = None
        
        with pytest.raises(ResourceNotFoundError):
            await get_category(
                category_id="nonexistent",
                current_user=mock_current_user,
                auth_context="user",
                prompt_service=mock_prompt_service,
                error_handler=mock_error_handler,
            )


# ============================================================================
# TEST: PUT /categories/{category_id}
# ============================================================================

class TestUpdateCategory:
    """Tests for updating a category endpoint."""

    @pytest.mark.asyncio
    async def test_refreshes_user_business_unit_names_for_top_level_category(
        self,
        mock_current_user,
        mock_prompt_service,
        mock_permission_service,
        mock_user_service,
        mock_error_handler,
    ):
        """Given top-level category, when updated, then refresh user BU names."""
        from app.api.v1.routes.prompts import update_category
        from app.schemas.prompts import CategoryUpdate

        mock_prompt_service.get_category.return_value = create_category(parent_category_id=None)
        mock_prompt_service.update_category.return_value = create_category(name="Updated", parent_category_id=None)

        payload = CategoryUpdate(name="Updated", parent_category_id=None)

        result = await update_category(
            category_id="cat_123",
            category=payload,
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            user_service=mock_user_service,
            error_handler=mock_error_handler,
        )

        assert result["name"] == "Updated"
        mock_user_service.refresh_business_unit_names.assert_called_once_with("cat_123")


# ============================================================================
# TEST: DELETE /categories/{category_id}
# ============================================================================

class TestDeleteCategory:
    """Tests for deleting a category endpoint."""
    
    @pytest.mark.asyncio
    async def test_deletes_category_and_subcategories(
        self, mock_current_user, mock_prompt_service, mock_permission_service, mock_user_service, mock_error_handler
    ):
        """Given editor with access, when deleting category, then deletes and cleans up users."""
        from app.api.v1.routes.prompts import delete_category
        
        mock_prompt_service.get_category.return_value = create_category()
        mock_user_service.remove_business_unit_from_users = AsyncMock(return_value=1)
        
        result = await delete_category(
            category_id="cat_123",
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            user_service=mock_user_service,
            error_handler=mock_error_handler,
        )
        
        assert result["status"] == 200
        mock_prompt_service.delete_category_and_subcategories.assert_called_once_with("cat_123")
        mock_user_service.remove_business_unit_from_users.assert_called_once_with("cat_123")


# ============================================================================
# TEST: POST /subcategories
# ============================================================================

class TestCreateSubcategory:
    """Tests for creating subcategories endpoint."""
    
    @pytest.mark.asyncio
    async def test_creates_subcategory(
        self, mock_current_user, mock_prompt_service, mock_permission_service,
        mock_talking_points_service, mock_error_handler
    ):
        """Given valid parent category, when creating subcategory, then creates."""
        from app.api.v1.routes.prompts import create_subcategory
        from app.schemas.prompts import SubcategoryCreate
        
        mock_prompt_service.get_category.return_value = create_category()
        mock_prompt_service.create_subcategory.return_value = create_subcategory()
        
        sub_create = SubcategoryCreate(
            name="New Sub",
            category_id="cat_123",
            prompts={"system": "Test"},
            preSessionTalkingPoints=[],
            inSessionTalkingPoints=[],
        )
        
        result = await create_subcategory(
            subcategory=sub_create,
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        assert result is not None


# ============================================================================
# TEST: GET /subcategories
# ============================================================================

class TestListSubcategories:
    """Tests for listing subcategories endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_paginated_subcategories(
        self, mock_current_user, mock_prompt_service, mock_talking_points_service, mock_error_handler
    ):
        """Given subcategories exist, when listing, then returns paginated result."""
        from app.api.v1.routes.prompts import list_subcategories
        
        mock_prompt_service.list_subcategories.return_value = {
            "items": [create_subcategory()],
            "total": 1,
        }
        
        result = await list_subcategories(
            category_id=None,
            limit=50,
            offset=0,
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        assert "subcategories" in result
        assert result["total"] == 1
    
    @pytest.mark.asyncio
    async def test_filters_by_category_id(
        self, mock_current_user, mock_prompt_service, mock_talking_points_service, mock_error_handler
    ):
        """Given category_id filter, when listing, then applies filter."""
        from app.api.v1.routes.prompts import list_subcategories
        
        mock_prompt_service.list_subcategories.return_value = {
            "items": [],
            "total": 0,
        }
        
        await list_subcategories(
            category_id="cat_123",
            limit=50,
            offset=0,
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        mock_prompt_service.list_subcategories.assert_called_with(
            category_id="cat_123",
            limit=50,
            offset=0,
        )


# ============================================================================
# TEST: GET /subcategories/{subcategory_id}
# ============================================================================

class TestGetSubcategory:
    """Tests for getting a specific subcategory endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_subcategory_when_found(
        self, mock_current_user, mock_prompt_service, mock_talking_points_service, mock_error_handler
    ):
        """Given existing subcategory, when getting, then returns subcategory."""
        from app.api.v1.routes.prompts import get_subcategory
        
        mock_prompt_service.get_subcategory.return_value = create_subcategory()
        
        result = await get_subcategory(
            subcategory_id="sub_123",
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        assert result["id"] == "sub_123"
    
    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(
        self, mock_current_user, mock_prompt_service, mock_talking_points_service, mock_error_handler
    ):
        """Given nonexistent subcategory, when getting, then raises 404."""
        from app.api.v1.routes.prompts import get_subcategory
        from app.core.errors.domain import ResourceNotFoundError
        
        mock_prompt_service.get_subcategory.return_value = None
        
        with pytest.raises(ResourceNotFoundError):
            await get_subcategory(
                subcategory_id="nonexistent",
                current_user=mock_current_user,
                auth_context="user",
                prompt_service=mock_prompt_service,
                talking_points_service=mock_talking_points_service,
                error_handler=mock_error_handler,
            )


# ============================================================================
# TEST: PATCH /subcategories/{subcategory_id}/move
# ============================================================================

class TestMoveSubcategory:
    """Tests for moving subcategory endpoint."""
    
    @pytest.mark.asyncio
    async def test_moves_subcategory_to_new_category(
        self, mock_current_user, mock_prompt_service, mock_permission_service,
        mock_talking_points_service, mock_error_handler
    ):
        """Given valid subcategory and target, when moving, then moves."""
        from app.api.v1.routes.prompts import move_subcategory
        
        mock_prompt_service.get_subcategory.return_value = create_subcategory()
        mock_prompt_service.get_category.return_value = create_category(category_id="new_cat")
        mock_prompt_service.move_subcategory.return_value = create_subcategory(category_id="new_cat")
        
        result = await move_subcategory(
            subcategory_id="sub_123",
            new_category_id="new_cat",
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        assert result is not None
        mock_prompt_service.move_subcategory.assert_called_once()


# ============================================================================
# TEST: DELETE /subcategories/{subcategory_id}
# ============================================================================

class TestDeleteSubcategory:
    """Tests for deleting a subcategory endpoint."""
    
    @pytest.mark.asyncio
    async def test_deletes_subcategory(
        self, mock_current_user, mock_prompt_service, mock_permission_service, mock_error_handler
    ):
        """Given editor with access, when deleting subcategory, then deletes."""
        from app.api.v1.routes.prompts import delete_subcategory
        
        mock_prompt_service.get_subcategory.return_value = create_subcategory()
        
        result = await delete_subcategory(
            subcategory_id="sub_123",
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_permission_service,
            error_handler=mock_error_handler,
        )
        
        assert result["status"] == 200


# ============================================================================
# TEST: GET /retrieve_prompts
# ============================================================================

class TestRetrievePrompts:
    """Tests for retrieving prompts hierarchy endpoint."""
    
    @pytest.mark.asyncio
    async def test_returns_hierarchy(
        self, mock_current_user, mock_prompt_service, mock_error_handler
    ):
        """Given prompts exist, when retrieving hierarchy, then returns hierarchy."""
        from app.api.v1.routes.prompts import retrieve_prompts
        
        mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
            {
                "category_name": "Category 1",
                "category_id": "cat_1",
                "subcategories": [],
            }
        ]
        
        result = await retrieve_prompts(
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            error_handler=mock_error_handler,
        )
        
        assert result["status"] == 200
        assert len(result["data"]) == 1
    
    @pytest.mark.asyncio
    async def test_returns_inference_fields_in_subcategories(
        self, mock_current_user, mock_prompt_service, mock_error_handler
    ):
        """Given subcategories with inference fields, when retrieving hierarchy, then includes those fields."""
        from app.api.v1.routes.prompts import retrieve_prompts
        
        mock_prompt_service.retrieve_prompts_hierarchy.return_value = [
            {
                "category_name": "Category 1",
                "category_id": "cat_1",
                "subcategories": [
                    {
                        "subcategory_name": "Subcat 1",
                        "subcategory_id": "sub_1",
                        "prompts": {},
                        "preSessionTalkingPoints": [],
                        "inSessionTalkingPoints": [],
                        "analysis_model": "gpt-4o",
                        "analysis_reasoning": "high",
                        "analysis_verbosity": "medium",
                    }
                ],
            }
        ]
        
        result = await retrieve_prompts(
            current_user=mock_current_user,
            auth_context="user",
            prompt_service=mock_prompt_service,
            error_handler=mock_error_handler,
        )
        
        assert result["status"] == 200
        assert len(result["data"]) == 1
        
        # Verify inference fields are present in subcategory
        subcat = result["data"][0]["subcategories"][0]
        assert "analysis_model" in subcat
        assert subcat["analysis_model"] == "gpt-4o"
        assert "analysis_reasoning" in subcat
        assert subcat["analysis_reasoning"] == "high"
        assert "analysis_verbosity" in subcat
        assert subcat["analysis_verbosity"] == "medium"


# ============================================================================
# TEST: Router properly uses sentinel pattern for partial updates
# ============================================================================
class TestUpdateSubcategoryWithSentinelPattern:
    """
    Test that the update_subcategory router endpoint properly uses the
    _NOT_PROVIDED sentinel pattern for partial updates of inference fields.
    
    Issue: Router always passes subcategory.analysis_model (etc.) to service,
    which are None when omitted → service treats as "clear field" instead of
    "preserve existing value".
    
    Fix: Router should check which fields were provided and pass _NOT_PROVIDED
    for fields that were not included in the request.
    """
    
    @pytest.mark.asyncio
    async def test_update_subcategory_without_inference_fields_preserves_them(
        self, mock_current_user, mock_error_handler
    ):
        """
        Given a subcategory with inference fields set,
        when updating WITHOUT including those fields in the request,
        then the existing inference field values should be preserved.
        """
        from app.api.v1.routes.prompts import update_subcategory
        import json
        
        # Setup: Create mock services
        mock_prompt_service = AsyncMock()
        mock_perm_service = MagicMock()
        mock_talking_points_service = MagicMock()
        
        # Existing subcategory has inference fields set
        existing_subcategory = {
            "id": "sub_123",
            "category_id": "cat_123",
            "business_unit_id": "bu_123",
            "name": "Original Name",
            "prompts": {"key1": "prompt1"},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
            "analysis_model": "gpt-4o",
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
            "created_at": 1234567890,
            "updated_at": 1234567890,
        }
        
        mock_prompt_service.get_subcategory.return_value = existing_subcategory
        mock_perm_service.set_prompt_service = MagicMock()
        mock_perm_service.can_edit_prompt = AsyncMock(return_value=True)
        mock_talking_points_service.validate_talking_points_structure.return_value = []
        mock_talking_points_service.ensure_talking_points_structure.side_effect = lambda x, _: x
        
        # Updated subcategory should preserve inference fields
        updated_subcategory = existing_subcategory.copy()
        updated_subcategory["name"] = "Updated Name"
        updated_subcategory["updated_at"] = 1234567999
        
        mock_prompt_service.update_subcategory.return_value = updated_subcategory
        
        # Create a request that updates ONLY the name, NOT the inference fields
        class MockRequest:
            async def body(self):
                # This JSON does NOT include inference fields
                return json.dumps({
                    "name": "Updated Name",
                    "prompts": {"key1": "prompt1"},
                    "preSessionTalkingPoints": [],
                    "inSessionTalkingPoints": [],
                }).encode()
        
        request = MockRequest()
        
        # Execute: Call the router endpoint
        result = await update_subcategory(
            request=request,
            subcategory_id="sub_123",
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_perm_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        # Verify: The service was called with _NOT_PROVIDED for inference fields
        # (not None, which would clear them)
        from app.services.prompts.prompt_service import _NOT_PROVIDED
        
        call_args = mock_prompt_service.update_subcategory.call_args
        assert call_args is not None, "update_subcategory should have been called"
        
        # Check that inference fields were passed as _NOT_PROVIDED (not None)
        # Arguments are: (subcategory_id, name, prompts, pre, in_session, analysis_model, analysis_reasoning, analysis_verbosity)
        assert call_args[0][5] is _NOT_PROVIDED, "analysis_model should be _NOT_PROVIDED when not in request"
        assert call_args[0][6] is _NOT_PROVIDED, "analysis_reasoning should be _NOT_PROVIDED when not in request"
        assert call_args[0][7] is _NOT_PROVIDED, "analysis_verbosity should be _NOT_PROVIDED when not in request"
        
        # Verify: Result preserves the inference fields
        assert result["analysis_model"] == "gpt-4o"
        assert result["analysis_reasoning"] == "high"
        assert result["analysis_verbosity"] == "medium"
    
    @pytest.mark.asyncio
    async def test_update_subcategory_with_explicit_none_clears_fields(
        self, mock_current_user, mock_error_handler
    ):
        """
        Given a subcategory with inference fields set,
        when updating WITH inference fields explicitly set to None,
        then those fields should be cleared.
        """
        from app.api.v1.routes.prompts import update_subcategory
        import json
        
        # Setup: Create mock services
        mock_prompt_service = AsyncMock()
        mock_perm_service = MagicMock()
        mock_talking_points_service = MagicMock()
        
        # Existing subcategory has inference fields set
        existing_subcategory = {
            "id": "sub_456",
            "category_id": "cat_456",
            "business_unit_id": "bu_456",
            "name": "Original Name",
            "prompts": {"key1": "prompt1"},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
            "analysis_model": "gpt-4o",
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
            "created_at": 1234567890,
            "updated_at": 1234567890,
        }
        
        mock_prompt_service.get_subcategory.return_value = existing_subcategory
        mock_perm_service.set_prompt_service = MagicMock()
        mock_perm_service.can_edit_prompt = AsyncMock(return_value=True)
        mock_talking_points_service.validate_talking_points_structure.return_value = []
        mock_talking_points_service.ensure_talking_points_structure.side_effect = lambda x, _: x
        
        # Updated subcategory should have cleared inference fields
        updated_subcategory = existing_subcategory.copy()
        updated_subcategory["name"] = "Updated Name"
        del updated_subcategory["analysis_model"]
        del updated_subcategory["analysis_reasoning"]
        del updated_subcategory["analysis_verbosity"]
        updated_subcategory["updated_at"] = 1234567999
        
        mock_prompt_service.update_subcategory.return_value = updated_subcategory
        
        # Create a request that explicitly sets inference fields to null
        class MockRequest:
            async def body(self):
                # This JSON explicitly includes inference fields as null
                return json.dumps({
                    "name": "Updated Name",
                    "prompts": {"key1": "prompt1"},
                    "preSessionTalkingPoints": [],
                    "inSessionTalkingPoints": [],
                    "analysis_model": None,
                    "analysis_reasoning": None,
                    "analysis_verbosity": None,
                }).encode()
        
        request = MockRequest()
        
        # Execute: Call the router endpoint
        result = await update_subcategory(
            request=request,
            subcategory_id="sub_456",
            current_user=mock_current_user,
            auth_context="editor",
            prompt_service=mock_prompt_service,
            perm_service=mock_perm_service,
            talking_points_service=mock_talking_points_service,
            error_handler=mock_error_handler,
        )
        
        # Verify: The service was called with None for inference fields (to clear them)
        call_args = mock_prompt_service.update_subcategory.call_args
        assert call_args is not None, "update_subcategory should have been called"
        
        # Check that inference fields were passed as None (to clear them)
        assert call_args[0][5] is None, "analysis_model should be None when explicitly null in request"
        assert call_args[0][6] is None, "analysis_reasoning should be None when explicitly null in request"
        assert call_args[0][7] is None, "analysis_verbosity should be None when explicitly null in request"
        
        # Verify: Result has cleared the inference fields
        assert "analysis_model" not in result
        assert "analysis_reasoning" not in result
        assert "analysis_verbosity" not in result
