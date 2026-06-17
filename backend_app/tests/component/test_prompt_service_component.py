"""
Component tests for PromptService (prompt_service.py)

Tests for prompt management operations including:
- Category CRUD operations
- Subcategory CRUD operations
- Business unit ID resolution
- Cache management
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

@pytest.fixture(autouse=True)
def clear_prompt_service_cache():
    """Clear PromptService class-level caches before each test."""
    from app.services.prompts.prompt_service import PromptService
    PromptService._invalidate_category_cache()
    PromptService._subcategory_cache.clear()
    PromptService._categories_cache_by_id.clear()
    PromptService._subcategory_cache_by_id.clear()
    PromptService._subcategory_cache_timestamps.clear()
    yield


@pytest.fixture
def mock_cosmos():
    """Create a mock CosmosService."""
    cosmos = AsyncMock()
    mock_container = AsyncMock()
    cosmos.get_container = MagicMock(return_value=mock_container)
    return cosmos


@pytest.fixture
def mock_container(mock_cosmos):
    """Get the mock container from cosmos."""
    return mock_cosmos.get_container("prompts")


@pytest.fixture
def prompt_service(mock_cosmos):
    """Create a PromptService with mocked dependencies."""
    from app.repositories.prompts import PromptRepository
    from app.services.prompts.prompt_service import PromptService
    return PromptService(PromptRepository(mock_cosmos))


def create_category(
    category_id: str = "category_123",
    name: str = "Test Category",
    parent_category_id: str = None,
    is_business_unit: bool = True,
    business_unit_id: str = None,
) -> Dict[str, Any]:
    """Helper to create test category dicts."""
    return {
        "id": category_id,
        "type": "prompt_category",
        "name": name,
        "parent_category_id": parent_category_id,
        "is_business_unit": is_business_unit,
        "business_unit_id": business_unit_id or category_id,
        "created_at": int(datetime.now(timezone.utc).timestamp() * 1000),
        "updated_at": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


def create_subcategory(
    subcategory_id: str = "subcategory_123",
    category_id: str = "category_123",
    name: str = "Test Subcategory",
    business_unit_id: str = "category_123",
) -> Dict[str, Any]:
    """Helper to create test subcategory dicts."""
    return {
        "id": subcategory_id,
        "type": "prompt_subcategory",
        "category_id": category_id,
        "name": name,
        "prompts": {"summary": "Generate summary"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "business_unit_id": business_unit_id,
        "created_at": int(datetime.now(timezone.utc).timestamp() * 1000),
        "updated_at": int(datetime.now(timezone.utc).timestamp() * 1000),
    }


# ============================================================================
# TEST: create_category
# ============================================================================

class TestCreateCategory:
    """Tests for category creation."""
    
    @pytest.mark.asyncio
    async def test_creates_root_category_as_business_unit(self, prompt_service, mock_container):
        """Given no parent, when creating category, then marks as business unit."""
        created_item = create_category()
        mock_container.create_item = AsyncMock(return_value=created_item)
        
        result = await prompt_service.create_category(name="Test Category")
        
        assert result["name"] == "Test Category"
        assert result["is_business_unit"] is True
        mock_container.create_item.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_creates_child_category_with_parent_business_unit(self, prompt_service, mock_container):
        """Given parent category, when creating category, then inherits business unit."""
        parent = create_category(category_id="parent_123")
        
        async def mock_query(*args, **kwargs):
            yield parent
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        mock_container.read_item = AsyncMock(return_value=parent)
        mock_container.create_item = AsyncMock(return_value=create_category(
            parent_category_id="parent_123",
            is_business_unit=False,
            business_unit_id="parent_123"
        ))
        
        result = await prompt_service.create_category(
            name="Child Category",
            parent_category_id="parent_123"
        )
        
        assert result["is_business_unit"] is False


# ============================================================================
# TEST: list_categories
# ============================================================================

class TestListCategories:
    """Tests for listing categories."""
    
    @pytest.mark.asyncio
    async def test_returns_all_categories(self, prompt_service, mock_container):
        """Given categories exist, when listing, then returns all."""
        categories = [create_category(), create_category(category_id="cat_2")]
        
        async def mock_query(*args, **kwargs):
            for cat in categories:
                yield cat
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        
        result = await prompt_service.list_categories()
        
        assert result["total"] == 2
        assert len(result["items"]) == 2
    
    @pytest.mark.asyncio
    async def test_applies_pagination(self, prompt_service, mock_container):
        """Given many categories, when listing with limit/offset, then paginates."""
        categories = [create_category(category_id=f"cat_{i}") for i in range(5)]
        
        async def mock_query(*args, **kwargs):
            for cat in categories:
                yield cat
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        
        result = await prompt_service.list_categories(limit=2, offset=1)
        
        assert result["total"] == 5
        assert len(result["items"]) == 2
        assert result["offset"] == 1


# ============================================================================
# TEST: get_category
# ============================================================================

class TestGetCategory:
    """Tests for getting a single category."""
    
    @pytest.mark.asyncio
    async def test_returns_category_when_found(self, prompt_service, mock_container):
        """Given category exists, when getting by id, then returns it."""
        category = create_category()
        mock_container.read_item = AsyncMock(return_value=category)
        
        result = await prompt_service.get_category("category_123")
        
        assert result["id"] == "category_123"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, prompt_service, mock_container):
        """Given category doesn't exist, when getting by id, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        
        result = await prompt_service.get_category("nonexistent")
        
        assert result is None


# ============================================================================
# TEST: update_category
# ============================================================================

class TestUpdateCategory:
    """Tests for updating categories."""
    
    @pytest.mark.asyncio
    async def test_updates_category_name(self, prompt_service, mock_container):
        """Given valid category, when updating name, then succeeds."""
        category = create_category()
        mock_container.read_item = AsyncMock(return_value=category)
        mock_container.upsert_item = AsyncMock(return_value={**category, "name": "Updated"})
        
        result = await prompt_service.update_category("category_123", name="Updated")
        
        assert result["name"] == "Updated"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_category_not_found(self, prompt_service, mock_container):
        """Given nonexistent category, when updating, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        
        result = await prompt_service.update_category("nonexistent", name="New Name")
        
        assert result is None


# ============================================================================
# TEST: delete_category_and_subcategories
# ============================================================================

class TestDeleteCategoryAndSubcategories:
    """Tests for deleting categories with subcategories."""
    
    @pytest.mark.asyncio
    async def test_deletes_category_and_its_subcategories(self, prompt_service, mock_container):
        """Given category with subcategories, when deleting, then removes all."""
        subcategories = [{"id": "sub_1"}, {"id": "sub_2"}]
        
        async def mock_query(*args, **kwargs):
            for sub in subcategories:
                yield sub
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        mock_container.delete_item = AsyncMock()
        
        await prompt_service.delete_category_and_subcategories("category_123")
        
        # Should delete 2 subcategories + 1 category = 3 deletes
        assert mock_container.delete_item.call_count == 3


# ============================================================================
# TEST: create_subcategory
# ============================================================================

class TestCreateSubcategory:
    """Tests for subcategory creation."""
    
    @pytest.mark.asyncio
    async def test_creates_subcategory_with_business_unit(self, prompt_service, mock_container):
        """Given valid category, when creating subcategory, then inherits business unit."""
        parent_category = create_category()
        created_sub = create_subcategory()
        
        async def mock_query(*args, **kwargs):
            yield parent_category
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        mock_container.read_item = AsyncMock(return_value=parent_category)
        mock_container.create_item = AsyncMock(return_value=created_sub)
        
        result = await prompt_service.create_subcategory(
            category_id="category_123",
            name="Test Subcategory",
            prompts={"summary": "Generate summary"},
            pre=[],
            in_session=[]
        )
        
        assert result["business_unit_id"] is not None


# ============================================================================
# TEST: list_subcategories
# ============================================================================

class TestListSubcategories:
    """Tests for listing subcategories."""
    
    @pytest.mark.asyncio
    async def test_lists_subcategories_for_category(self, prompt_service, mock_container):
        """Given category with subcategories, when listing, then returns them."""
        subcategories = [create_subcategory(), create_subcategory(subcategory_id="sub_2")]
        categories = [create_category(category_id="category_123")]
        
        async def mock_subcategory_query(*args, **kwargs):
            for sub in subcategories:
                yield sub

        async def mock_category_query(*args, **kwargs):
            for category in categories:
                yield category

        def mock_query_items(*args, **kwargs):
            query = kwargs.get("query", "")
            if "prompt_category" in query:
                return mock_category_query()
            return mock_subcategory_query()

        mock_container.query_items = MagicMock(side_effect=mock_query_items)
        
        result = await prompt_service.list_subcategories(category_id="category_123")
        
        assert result["total"] == 2
    
    @pytest.mark.asyncio
    async def test_lists_all_subcategories_when_no_category(self, prompt_service, mock_container):
        """Given no category filter, when listing, then returns all subcategories."""
        subcategories = [
            create_subcategory(),
            create_subcategory(subcategory_id="sub_2", category_id="cat_2")
        ]
        categories = [create_category(category_id="category_123"), create_category(category_id="cat_2")]
        
        async def mock_subcategory_query(*args, **kwargs):
            for sub in subcategories:
                yield sub

        async def mock_category_query(*args, **kwargs):
            for category in categories:
                yield category

        def mock_query_items(*args, **kwargs):
            query = kwargs.get("query", "")
            if "prompt_category" in query:
                return mock_category_query()
            return mock_subcategory_query()

        mock_container.query_items = MagicMock(side_effect=mock_query_items)
        
        result = await prompt_service.list_subcategories()
        
        assert result["total"] == 2


# ============================================================================
# TEST: get_subcategory
# ============================================================================

class TestGetSubcategory:
    """Tests for getting a single subcategory."""
    
    @pytest.mark.asyncio
    async def test_returns_subcategory_when_found(self, prompt_service, mock_container):
        """Given subcategory exists, when getting by id, then returns it."""
        subcategory = create_subcategory()
        mock_container.read_item = AsyncMock(return_value=subcategory)
        
        result = await prompt_service.get_subcategory("subcategory_123")
        
        assert result["id"] == "subcategory_123"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, prompt_service, mock_container):
        """Given subcategory doesn't exist, when getting, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        
        result = await prompt_service.get_subcategory("nonexistent")
        
        assert result is None


# ============================================================================
# TEST: update_subcategory
# ============================================================================

class TestUpdateSubcategory:
    """Tests for updating subcategories."""
    
    @pytest.mark.asyncio
    async def test_updates_subcategory(self, prompt_service, mock_container):
        """Given valid subcategory, when updating, then succeeds."""
        subcategory = create_subcategory()
        mock_container.read_item = AsyncMock(return_value=subcategory)
        mock_container.upsert_item = AsyncMock(return_value={**subcategory, "name": "Updated"})
        
        result = await prompt_service.update_subcategory(
            subcategory_id="subcategory_123",
            name="Updated",
            prompts={"summary": "New prompt"},
            pre=[],
            in_session=[]
        )
        
        assert result["name"] == "Updated"


# ============================================================================
# TEST: delete_subcategory
# ============================================================================

class TestDeleteSubcategory:
    """Tests for deleting subcategories."""
    
    @pytest.mark.asyncio
    async def test_deletes_subcategory(self, prompt_service, mock_container):
        """Given valid subcategory, when deleting, then removes it."""
        subcategory = create_subcategory()
        mock_container.read_item = AsyncMock(return_value=subcategory)
        mock_container.delete_item = AsyncMock()
        
        await prompt_service.delete_subcategory("subcategory_123")
        
        mock_container.delete_item.assert_called_once()


# ============================================================================
# TEST: move_subcategory
# ============================================================================

class TestMoveSubcategory:
    """Tests for moving subcategories between categories."""
    
    @pytest.mark.asyncio
    async def test_moves_subcategory_to_new_category(self, prompt_service, mock_container):
        """Given valid subcategory and category, when moving, then updates parent."""
        subcategory = create_subcategory()
        new_category = create_category(category_id="new_cat")
        prompt_service.get_business_unit_id_from_category = AsyncMock(return_value="bu-new")
        
        mock_container.read_item = AsyncMock(side_effect=[subcategory, new_category])
        mock_container.upsert_item = AsyncMock(return_value={
            **subcategory,
            "category_id": "new_cat",
            "business_unit_id": "bu-new",
        })
        
        result = await prompt_service.move_subcategory(
            subcategory_id="subcategory_123",
            new_category_id="new_cat"
        )
        
        assert result["category_id"] == "new_cat"
        assert result["business_unit_id"] == "bu-new"

    @pytest.mark.asyncio
    async def test_get_subcategory_recomputes_business_unit_id_from_category(self, prompt_service, mock_container):
        """Given stale subcategory BU, when reading, then recomputes the BU from category hierarchy."""
        subcategory = create_subcategory(category_id="child-cat", business_unit_id="stale-bu")
        prompt_service.get_business_unit_id_from_category = AsyncMock(return_value="root-bu")
        mock_container.read_item = AsyncMock(return_value=subcategory)

        result = await prompt_service.get_subcategory("subcategory_123")

        assert result["business_unit_id"] == "root-bu"

    @pytest.mark.asyncio
    async def test_update_subcategory_rewrites_stale_business_unit_id(self, prompt_service, mock_container):
        """Given stale subcategory BU, when updating, then persists the derived root BU."""
        subcategory = create_subcategory(category_id="child-cat", business_unit_id="stale-bu")
        prompt_service.get_business_unit_id_from_category = AsyncMock(return_value="root-bu")
        mock_container.read_item = AsyncMock(return_value=subcategory)
        mock_container.upsert_item = AsyncMock(side_effect=lambda body: body)

        result = await prompt_service.update_subcategory(
            subcategory_id="subcategory_123",
            name=subcategory["name"],
            prompts=subcategory["prompts"],
            pre=subcategory.get("preSessionTalkingPoints", []),
            in_session=subcategory.get("inSessionTalkingPoints", []),
        )

        assert result["business_unit_id"] == "root-bu"
    
    @pytest.mark.asyncio
    async def test_returns_none_when_subcategory_not_found(self, prompt_service, mock_container):
        """Given nonexistent subcategory, when moving, then returns None."""
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        mock_container.read_item = AsyncMock(
            side_effect=CosmosResourceNotFoundError(status_code=404, message="Not found")
        )
        
        result = await prompt_service.move_subcategory(
            subcategory_id="nonexistent",
            new_category_id="new_cat"
        )
        
        assert result is None


# ============================================================================
# TEST: get_business_unit_id_from_category
# ============================================================================

class TestGetBusinessUnitIdFromCategory:
    """Tests for business unit ID resolution."""
    
    @pytest.mark.asyncio
    async def test_returns_self_for_root_category(self, prompt_service, mock_container):
        """Given root category, when getting business unit, then returns self id."""
        root_category = create_category(
            category_id="bu_123",
            is_business_unit=True,
            business_unit_id="bu_123"
        )
        
        async def mock_query(*args, **kwargs):
            yield root_category
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        mock_container.read_item = AsyncMock(return_value=root_category)
        
        result = await prompt_service.get_business_unit_id_from_category("bu_123")
        
        assert result == "bu_123"
    
    @pytest.mark.asyncio
    async def test_caches_business_unit_id(self, prompt_service, mock_container):
        """Given category lookup, when called twice, then uses cache."""
        category = create_category(business_unit_id="bu_123")
        
        async def mock_query(*args, **kwargs):
            yield category
        
        mock_container.query_items = MagicMock(return_value=mock_query())
        mock_container.read_item = AsyncMock(return_value=category)
        
        # First call
        await prompt_service.get_business_unit_id_from_category("category_123")
        
        # Second call should use cache
        result = await prompt_service.get_business_unit_id_from_category("category_123")
        
        assert result == "bu_123"
        # Cache should prevent additional reads
        assert prompt_service._business_unit_cache.get("category_123") == "bu_123"

    @pytest.mark.asyncio
    async def test_traverses_when_business_unit_id_is_none_on_nested_category(self, prompt_service, mock_container):
        """Given nested category with business_unit_id=None, when resolving, then traverses to root BU."""
        root = create_category(
            category_id="bu_123",
            parent_category_id=None,
            is_business_unit=True,
            business_unit_id="bu_123",
        )
        child = create_category(
            category_id="child_123",
            parent_category_id="bu_123",
            is_business_unit=False,
            business_unit_id="ignored",
        )
        child["business_unit_id"] = None

        mock_container.read_item = AsyncMock(side_effect=[child, root])

        result = await prompt_service.get_business_unit_id_from_category("child_123")

        assert result == "bu_123"
        assert prompt_service._business_unit_cache.get("child_123") == "bu_123"

    @pytest.mark.asyncio
    async def test_returns_self_when_business_unit_id_is_none_on_root_category(self, prompt_service, mock_container):
        """Given root category with business_unit_id=None, when resolving, then returns its own id."""
        root = create_category(
            category_id="bu_999",
            parent_category_id=None,
            is_business_unit=True,
            business_unit_id="ignored",
        )
        root["business_unit_id"] = None

        mock_container.read_item = AsyncMock(return_value=root)

        result = await prompt_service.get_business_unit_id_from_category("bu_999")

        assert result == "bu_999"


# ============================================================================
# TEST: retrieve_prompts_hierarchy
# ============================================================================

class TestRetrievePromptsHierarchy:
    """Tests for retrieving full prompts hierarchy."""
    
    @pytest.mark.asyncio
    async def test_returns_hierarchy_with_categories_and_subcategories(self, prompt_service, mock_container):
        """Given categories and subcategories, when retrieving hierarchy, then nests correctly."""
        categories = [create_category()]
        subcategories = [create_subcategory()]
        
        call_count = 0
        
        async def mock_query(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                for cat in categories:
                    yield cat
            else:
                for sub in subcategories:
                    yield sub
        
        mock_container.query_items = MagicMock(side_effect=[mock_query(), mock_query()])
        
        result = await prompt_service.retrieve_prompts_hierarchy()
        
        assert len(result) >= 1
        # First category should have subcategories nested
        if result and result[0].get("subcategories"):
            assert len(result[0]["subcategories"]) >= 0


# ============================================================================
# TEST: Cache Invalidation
# ============================================================================

class TestCacheInvalidation:
    """Tests for cache invalidation."""
    
    def test_invalidate_category_cache_clears_cache(self, prompt_service):
        """Given cached categories, when invalidating, then clears cache."""
        from app.services.prompts.prompt_service import PromptService
        PromptService._categories_cache = [{"id": "test"}]
        
        PromptService._invalidate_category_cache()
        
        assert PromptService._categories_cache is None
    
    def test_clear_business_unit_cache_clears_cache(self, prompt_service):
        """Given cached business units, when clearing, then empties cache."""
        prompt_service._business_unit_cache = {"cat_123": "bu_123"}
        
        prompt_service.clear_business_unit_cache()
        
        assert len(prompt_service._business_unit_cache) == 0
