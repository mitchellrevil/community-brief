"""Unit tests for BusinessUnitService."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.repositories.business_units import BusinessUnitStatsRepository
from app.services.prompts.business_unit_service import BusinessUnitService


class TestCreateBusinessUnit:
    @pytest.mark.asyncio
    async def test_creates_business_unit_with_name(self):
        """Test creating a business unit with just a name."""
        # Setup mocks
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_create_category = AsyncMock(
            return_value={"id": "bu1", "name": "Sales", "type": "category"}
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.create_business_unit("Sales")
        
        assert result["id"] == "bu1"
        assert result["name"] == "Sales"
        mock_prompt_service.async_create_category.assert_called_once_with(
            name="Sales", parent_category_id=None
        )

    @pytest.mark.asyncio
    async def test_creates_business_unit_with_description(self):
        """Test creating a business unit with name and description."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_create_category = AsyncMock(
            return_value={"id": "bu2", "name": "Marketing"}
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.create_business_unit("Marketing", description="Marketing team")
        
        assert result["id"] == "bu2"
        assert result["description"] == "Marketing team"
        mock_prompt_service.async_create_category.assert_called_once()


class TestListBusinessUnits:
    @pytest.mark.asyncio
    async def test_lists_all_business_units(self):
        """Test listing business units returns paginated results."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.list_categories = AsyncMock(
            return_value={
                "items": [
                    {"id": "bu1", "name": "Sales", "parent_category_id": None},
                    {"id": "bu2", "name": "Marketing", "parent_category_id": None},
                    {"id": "cat1", "name": "Category 1", "parent_category_id": "bu1"},
                ]
            }
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.list_business_units(limit=10, offset=0)
        
        assert len(result["items"]) == 2
        assert result["total"] == 2
        assert result["limit"] == 10
        assert result["offset"] == 0

    @pytest.mark.asyncio
    async def test_lists_business_units_with_pagination(self):
        """Test pagination works correctly."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.list_categories = AsyncMock(
            return_value={
                "items": [
                    {"id": "bu1", "name": "Sales", "parent_category_id": None},
                    {"id": "bu2", "name": "Marketing", "parent_category_id": None},
                    {"id": "bu3", "name": "Engineering", "parent_category_id": None},
                ]
            }
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.list_business_units(limit=2, offset=1)
        
        assert len(result["items"]) == 2
        assert result["items"][0]["name"] == "Marketing"
        assert result["total"] == 3


class TestGetBusinessUnit:
    @pytest.mark.asyncio
    async def test_gets_existing_business_unit(self):
        """Test getting an existing business unit."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_get_category = AsyncMock(
            return_value={"id": "bu1", "name": "Sales", "description": "Sales team"}
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.get_business_unit("bu1")
        
        assert result["id"] == "bu1"
        assert result["name"] == "Sales"
        mock_prompt_service.async_get_category.assert_called_once_with("bu1")

    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_business_unit(self):
        """Test getting a non-existent business unit returns None."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_get_category = AsyncMock(return_value=None)
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.get_business_unit("nonexistent")
        
        assert result is None


class TestUpdateBusinessUnit:
    @pytest.mark.asyncio
    async def test_updates_business_unit_name(self):
        """Test updating a business unit name."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_update_category = AsyncMock(
            return_value={"id": "bu1", "name": "Sales Updated"}
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.update_business_unit("bu1", "Sales Updated")
        
        assert result["name"] == "Sales Updated"
        mock_prompt_service.async_update_category.assert_called_once_with(
            category_id="bu1", name="Sales Updated", parent_category_id=None
        )

    @pytest.mark.asyncio
    async def test_updates_business_unit_with_description(self):
        """Test updating a business unit with description."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_prompt_service.async_update_category = AsyncMock(
            return_value={"id": "bu1", "name": "Sales"}
        )
        
        service = BusinessUnitService(mock_prompt_service)
        result = await service.update_business_unit("bu1", "Sales", description="New description")
        
        assert result["description"] == "New description"


class TestAssignUserBusinessUnits:
    @pytest.mark.asyncio
    async def test_assigns_user_to_business_units(self):
        """Test assigning a user to business units."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_user_service = AsyncMock()
        mock_user_service.set_user_business_units = AsyncMock(
            return_value={"user_id": "user1", "business_unit_ids": ["bu1", "bu2"]}
        )
        
        service = BusinessUnitService(mock_prompt_service, mock_user_service)
        result = await service.assign_user_business_units("user1", ["bu1", "bu2"], mock_user_service)
        
        assert result["user_id"] == "user1"
        assert "bu1" in result["business_unit_ids"]
        mock_user_service.set_user_business_units.assert_called_once_with(
            target_user_id="user1", business_unit_ids=["bu1", "bu2"]
        )


class TestGetBusinessUnitStats:
    @pytest.mark.asyncio
    async def test_stats_method_exists(self):
        """Test that get_business_unit_stats delegates to the stats repository."""
        mock_cosmos = MagicMock()
        mock_prompt_service = AsyncMock()
        mock_stats_repository = AsyncMock()
        mock_stats_repository.get_stats.return_value = {
            "total_users": 10,
            "total_editors": 2,
            "total_categories": 3,
            "total_subcategories": 4,
            "total_prompts": 8,
        }

        service = BusinessUnitService(
            mock_prompt_service,
            stats_repository=mock_stats_repository,
        )
        result = await service.get_business_unit_stats("bu1")
        
        assert isinstance(result, dict)
        assert "business_unit_id" in result
        assert result["business_unit_id"] == "bu1"
        assert result["total_users"] == 10
        mock_stats_repository.get_stats.assert_awaited_once_with("bu1")

    @pytest.mark.asyncio
    async def test_stats_repository_counts_business_unit_resources(self):
        """Business unit stats repository owns the Cosmos queries."""
        mock_cosmos = MagicMock()

        class MockAsyncIterator:
            def __init__(self, data):
                self.data = data
                self.index = 0

            def __aiter__(self):
                return self

            async def __anext__(self):
                if self.index < len(self.data):
                    result = self.data[self.index]
                    self.index += 1
                    return result
                raise StopAsyncIteration

        def make_iterator(data):
            return MockAsyncIterator(data)

        mock_auth_container = MagicMock()
        mock_prompts_container = MagicMock()
        mock_cosmos.get_container = MagicMock(
            side_effect=lambda name: mock_auth_container if name == "auth" else mock_prompts_container
        )
        mock_auth_container.query_items = MagicMock(
            side_effect=[
                make_iterator([{"count": 10}]),
                make_iterator([{"count": 2}]),
            ]
        )
        mock_prompts_container.query_items = MagicMock(
            side_effect=[
                make_iterator([{"count": 3}]),
                make_iterator([{"count": 4}]),
                make_iterator([{"prompts": {"p1": {}, "p2": {}}}]),
            ]
        )

        result = await BusinessUnitStatsRepository(mock_cosmos).get_stats("bu1")

        assert result == {
            "total_users": 10,
            "total_editors": 2,
            "total_categories": 3,
            "total_subcategories": 4,
            "total_prompts": 2,
        }
        first_user_query = mock_auth_container.query_items.call_args_list[0].kwargs["query"]
        assert "ARRAY_CONTAINS(c.business_unit_ids, @bu_id)" in first_user_query
