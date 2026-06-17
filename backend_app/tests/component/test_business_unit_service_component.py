"""
Component tests for BusinessUnitService (business_unit_service.py)

Tests for business unit operations including:
- Create business unit
- List business units
- Get business unit
- Update business unit
- Business unit statistics
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from typing import Dict, Any, List


# Mark all tests as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def mock_cosmos():
    """Create a mock CosmosService."""
    cosmos = AsyncMock()
    mock_auth_container = AsyncMock()
    mock_prompts_container = AsyncMock()
    
    def get_container(name):
        if name == "auth":
            return mock_auth_container
        return mock_prompts_container
    
    cosmos.get_container = MagicMock(side_effect=get_container)
    return cosmos


@pytest.fixture
def mock_prompt_service():
    """Create a mock PromptService."""
    service = AsyncMock()
    service.async_create_category = AsyncMock()
    service.async_get_category = AsyncMock()
    service.async_update_category = AsyncMock()
    service.list_categories = AsyncMock()
    return service


@pytest.fixture
def mock_user_service():
    """Create a mock UserService."""
    service = AsyncMock()
    service.set_user_business_units = AsyncMock()
    return service


@pytest.fixture
def business_unit_service(mock_cosmos, mock_prompt_service, mock_user_service):
    """Create a BusinessUnitService with mocked dependencies."""
    from app.repositories.business_units import BusinessUnitStatsRepository
    from app.services.prompts.business_unit_service import BusinessUnitService
    return BusinessUnitService(
        prompt_service=mock_prompt_service,
        user_service=mock_user_service,
        stats_repository=BusinessUnitStatsRepository(mock_cosmos),
    )


def create_business_unit(
    bu_id: str = "bu_123",
    name: str = "Test Business Unit",
    parent_category_id: str = None,
) -> Dict[str, Any]:
    """Helper to create test business unit dicts."""
    return {
        "id": bu_id,
        "type": "prompt_category",
        "name": name,
        "parent_category_id": parent_category_id,
        "is_business_unit": True,
        "business_unit_id": bu_id,
        "created_at": int(datetime.now(timezone.utc).timestamp() * 1000),
        "updated_at": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


# ============================================================================
# TEST: create_business_unit
# ============================================================================

class TestCreateBusinessUnit:
    """Tests for business unit creation."""
    
    @pytest.mark.asyncio
    async def test_creates_business_unit_as_root_category(
        self, business_unit_service, mock_prompt_service
    ):
        """Given name, when creating business unit, then creates root category."""
        created_bu = create_business_unit()
        mock_prompt_service.async_create_category.return_value = created_bu
        
        result = await business_unit_service.create_business_unit(name="Test Business Unit")
        
        mock_prompt_service.async_create_category.assert_called_once_with(
            name="Test Business Unit",
            parent_category_id=None
        )
        assert result["name"] == "Test Business Unit"
    
    @pytest.mark.asyncio
    async def test_adds_description_when_provided(
        self, business_unit_service, mock_prompt_service
    ):
        """Given name and description, when creating, then adds description."""
        created_bu = create_business_unit()
        mock_prompt_service.async_create_category.return_value = created_bu
        
        result = await business_unit_service.create_business_unit(
            name="Test BU",
            description="A test description"
        )
        
        assert result["description"] == "A test description"


# ============================================================================
# TEST: list_business_units
# ============================================================================

class TestListBusinessUnits:
    """Tests for listing business units."""
    
    @pytest.mark.asyncio
    async def test_returns_only_root_categories(
        self, business_unit_service, mock_prompt_service
    ):
        """Given mix of categories, when listing BUs, then returns only roots."""
        all_categories = [
            create_business_unit(bu_id="bu_1"),
            create_business_unit(bu_id="child_1", parent_category_id="bu_1"),
            create_business_unit(bu_id="bu_2"),
        ]
        mock_prompt_service.list_categories.return_value = {
            "items": all_categories,
            "total": 3
        }
        
        result = await business_unit_service.list_business_units()
        
        # Should only return bu_1 and bu_2 (no parent)
        assert result["total"] == 2
        assert len(result["items"]) == 2
    
    @pytest.mark.asyncio
    async def test_applies_pagination(
        self, business_unit_service, mock_prompt_service
    ):
        """Given many BUs, when listing with pagination, then paginates correctly."""
        all_bus = [create_business_unit(bu_id=f"bu_{i}") for i in range(5)]
        mock_prompt_service.list_categories.return_value = {
            "items": all_bus,
            "total": 5
        }
        
        result = await business_unit_service.list_business_units(limit=2, offset=1)
        
        assert result["limit"] == 2
        assert result["offset"] == 1
        assert len(result["items"]) == 2


# ============================================================================
# TEST: get_business_unit
# ============================================================================

class TestGetBusinessUnit:
    """Tests for getting a single business unit."""
    
    @pytest.mark.asyncio
    async def test_returns_business_unit_when_found(
        self, business_unit_service, mock_prompt_service
    ):
        """Given BU exists, when getting by id, then returns it."""
        bu = create_business_unit()
        mock_prompt_service.async_get_category.return_value = bu
        
        result = await business_unit_service.get_business_unit("bu_123")
        
        assert result["id"] == "bu_123"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self, business_unit_service, mock_prompt_service
    ):
        """Given BU doesn't exist, when getting by id, then returns None."""
        mock_prompt_service.async_get_category.return_value = None
        
        result = await business_unit_service.get_business_unit("nonexistent")
        
        assert result is None


# ============================================================================
# TEST: update_business_unit
# ============================================================================

class TestUpdateBusinessUnit:
    """Tests for updating business units."""
    
    @pytest.mark.asyncio
    async def test_updates_business_unit_name(
        self, business_unit_service, mock_prompt_service
    ):
        """Given valid BU, when updating name, then succeeds."""
        updated_bu = create_business_unit(name="Updated Name")
        mock_prompt_service.async_update_category.return_value = updated_bu
        
        result = await business_unit_service.update_business_unit(
            bu_id="bu_123",
            name="Updated Name"
        )
        
        assert result["name"] == "Updated Name"
    
    @pytest.mark.asyncio
    async def test_adds_description_on_update(
        self, business_unit_service, mock_prompt_service
    ):
        """Given description, when updating, then adds it."""
        updated_bu = create_business_unit()
        mock_prompt_service.async_update_category.return_value = updated_bu
        
        result = await business_unit_service.update_business_unit(
            bu_id="bu_123",
            name="Test",
            description="New description"
        )
        
        assert result["description"] == "New description"


# ============================================================================
# TEST: assign_user_business_units
# ============================================================================

class TestAssignUserBusinessUnits:
    """Tests for assigning business units to users."""
    
    @pytest.mark.asyncio
    async def test_assigns_business_units_to_user(
        self, business_unit_service, mock_user_service
    ):
        """Given user and BU ids, when assigning, then delegates to user service."""
        mock_user_service.set_user_business_units.return_value = {"status": "success"}
        
        result = await business_unit_service.assign_user_business_units(
            user_id="user_123",
            business_unit_ids=["bu_1", "bu_2"],
            user_service=mock_user_service
        )
        
        mock_user_service.set_user_business_units.assert_called_once_with(
            target_user_id="user_123",
            business_unit_ids=["bu_1", "bu_2"]
        )


# ============================================================================
# TEST: get_business_unit_stats
# ============================================================================

class TestGetBusinessUnitStats:
    """Tests for getting business unit statistics."""
    
    @pytest.mark.asyncio
    async def test_returns_stats_for_business_unit(
        self, business_unit_service, mock_cosmos
    ):
        """Given BU with resources, when getting stats, then returns counts."""
        auth_container = mock_cosmos.get_container("auth")
        prompts_container = mock_cosmos.get_container("prompts")
        
        # Mock user count query
        async def mock_auth_query(*args, **kwargs):
            query = kwargs.get("query", args[0] if args else "")
            if "Editor" in query:
                yield {"count": 2}
            else:
                yield {"count": 5}
        
        # Mock category/subcategory count queries
        async def mock_prompts_query(*args, **kwargs):
            query = kwargs.get("query", args[0] if args else "")
            if "prompt_category" in query:
                yield {"count": 3}
            elif "prompt_subcategory" in query and "prompts" not in query:
                yield {"count": 4}
            else:
                yield {"prompts": {"p1": "v1", "p2": "v2"}}
        
        auth_container.query_items = MagicMock(side_effect=mock_auth_query)
        prompts_container.query_items = MagicMock(side_effect=mock_prompts_query)
        
        result = await business_unit_service.get_business_unit_stats(
            business_unit_id="bu_123"
        )
        
        assert result["business_unit_id"] == "bu_123"
        assert "total_users" in result
        assert "total_editors" in result
        assert "total_categories" in result
        assert "total_subcategories" in result
        assert "total_prompts" in result
