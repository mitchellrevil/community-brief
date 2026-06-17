"""
Test fixes for Phase 2 code review issues.

Tests fix for:
1. retrieve_prompts_hierarchy() not exposing inference fields
2. update_subcategory() not allowing field clearing
"""

import pytest
from unittest.mock import MagicMock, AsyncMock
from app.repositories.prompts import PromptRepository
from app.services.prompts.prompt_service import PromptService


@pytest.fixture
def mock_cosmos_service():
    """Create a mock CosmosService."""
    return MagicMock()


@pytest.fixture
def prompt_service(mock_cosmos_service):
    """Create a PromptService with a mock CosmosService."""
    # Clear class-level caches before creating service
    PromptService._categories_cache = None
    PromptService._categories_cache_timestamp = 0.0
    PromptService._subcategory_cache = {}
    PromptService._subcategory_cache_timestamps = {}
    return PromptService(PromptRepository(mock_cosmos_service))


@pytest.fixture
def mock_container():
    """Create a mock container."""
    return MagicMock()


# ============================================================================
# TEST: Issue 1 - retrieve_prompts_hierarchy should expose inference fields
# ============================================================================

class TestRetrievePromptsHierarchyInferenceFields:
    """Test that retrieve_prompts_hierarchy includes inference configuration fields."""
    
    @pytest.mark.asyncio
    async def test_retrieve_prompts_includes_inference_fields(
        self, prompt_service, mock_cosmos_service
    ):
        """Given subcategories with inference fields, when retrieving hierarchy, then includes those fields."""
        # Arrange
        mock_container = MagicMock()
        mock_cosmos_service.get_container.return_value = mock_container
        
        # Mock categories
        category = {
            "id": "cat_123",
            "type": "prompt_category",
            "name": "Test Category",
            "parent_category_id": None,
        }
        
        # Mock subcategory with inference fields
        subcategory = {
            "id": "sub_123",
            "type": "prompt_subcategory",
            "category_id": "cat_123",
            "name": "Test Subcategory",
            "prompts": {"system": "Test prompt"},
            "preSessionTalkingPoints": ["Point 1"],
            "inSessionTalkingPoints": ["Point 2"],
            "analysis_model": "gpt-4o",
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
        }
        
        # Mock query_items to return categories then subcategories
        call_count = [0]
        
        async def mock_query(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                yield category
            else:
                yield subcategory
        
        mock_container.query_items = MagicMock(
            side_effect=[mock_query(), mock_query()]
        )
        
        # Act
        result = await prompt_service.retrieve_prompts_hierarchy()
        
        # Assert
        assert len(result) == 1
        assert result[0]["category_name"] == "Test Category"
        assert len(result[0]["subcategories"]) == 1
        
        subcat = result[0]["subcategories"][0]
        assert subcat["subcategory_name"] == "Test Subcategory"
        assert subcat["subcategory_id"] == "sub_123"
        
        # These assertions will fail initially - they test the fix
        assert "analysis_model" in subcat, "analysis_model should be included"
        assert subcat["analysis_model"] == "gpt-4o"
        assert "analysis_reasoning" in subcat, "analysis_reasoning should be included"
        assert subcat["analysis_reasoning"] == "high"
        assert "analysis_verbosity" in subcat, "analysis_verbosity should be included"
        assert subcat["analysis_verbosity"] == "medium"
    
    @pytest.mark.asyncio
    async def test_retrieve_prompts_handles_missing_inference_fields(
        self, prompt_service, mock_cosmos_service
    ):
        """Given subcategories without inference fields, when retrieving hierarchy, then handles gracefully."""
        # Arrange
        mock_container = MagicMock()
        mock_cosmos_service.get_container.return_value = mock_container
        
        category = {
            "id": "cat_456",
            "type": "prompt_category",
            "name": "Category Without Inference",
            "parent_category_id": None,
        }
        
        # Subcategory without inference fields
        subcategory = {
            "id": "sub_456",
            "type": "prompt_subcategory",
            "category_id": "cat_456",
            "name": "Subcategory No Inference",
            "prompts": {},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
        }
        
        call_count = [0]
        
        async def mock_query(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                yield category
            else:
                yield subcategory
        
        mock_container.query_items = MagicMock(
            side_effect=[mock_query(), mock_query()]
        )
        
        # Act
        result = await prompt_service.retrieve_prompts_hierarchy()
        
        # Assert
        assert len(result) == 1
        subcat = result[0]["subcategories"][0]
        
        # Fields should be present but None when not set
        assert "analysis_model" in subcat
        assert subcat["analysis_model"] is None
        assert "analysis_reasoning" in subcat
        assert subcat["analysis_reasoning"] is None
        assert "analysis_verbosity" in subcat
        assert subcat["analysis_verbosity"] is None


# ============================================================================
# TEST: Issue 2 - update_subcategory should allow clearing fields
# ============================================================================

class TestUpdateSubcategoryClearFields:
    """Test that update_subcategory can clear/reset inference fields to None."""
    
    @pytest.mark.asyncio
    async def test_update_subcategory_can_clear_analysis_model(
        self, prompt_service, mock_cosmos_service
    ):
        """Given subcategory with analysis_model set, when updating with None, then clears the field."""
        # Arrange
        mock_container = MagicMock()
        mock_cosmos_service.get_container.return_value = mock_container
        
        existing_subcategory = {
            "id": "sub_789",
            "type": "prompt_subcategory",
            "category_id": "cat_789",
            "business_unit_id": "bu_123",
            "name": "Old Name",
            "prompts": {"system": "Old prompt"},
            "preSessionTalkingPoints": ["Old point"],
            "inSessionTalkingPoints": [],
            "analysis_model": "gpt-4o",  # Currently set
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
        }
        
        mock_container.read_item = AsyncMock(return_value=existing_subcategory)
        mock_container.upsert_item = AsyncMock(return_value={"id": "sub_789"})
        
        # Act - explicitly pass None to clear analysis_model
        result = await prompt_service.update_subcategory(
            subcategory_id="sub_789",
            name="New Name",
            prompts={"system": "New prompt"},
            pre=["New point"],
            in_session=[],
            analysis_model=None,  # Explicit None should clear
            analysis_reasoning="high",
            analysis_verbosity="medium",
        )
        
        # Assert
        upsert_call = mock_container.upsert_item.call_args
        upserted_item = upsert_call[1]["body"]
        
        # This assertion will fail initially - it tests the fix
        assert "analysis_model" not in upserted_item or upserted_item["analysis_model"] is None, \
            "analysis_model should be cleared when explicitly set to None"
    
    @pytest.mark.asyncio
    async def test_update_subcategory_can_clear_all_inference_fields(
        self, prompt_service, mock_cosmos_service
    ):
        """Given subcategory with all inference fields set, when updating all to None, then clears all."""
        # Arrange
        mock_container = MagicMock()
        mock_cosmos_service.get_container.return_value = mock_container
        
        existing_subcategory = {
            "id": "sub_abc",
            "type": "prompt_subcategory",
            "category_id": "cat_abc",
            "business_unit_id": "bu_abc",
            "name": "Test",
            "prompts": {},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
            "analysis_model": "o1-mini",
            "analysis_reasoning": "low",
            "analysis_verbosity": "none",
        }
        
        mock_container.read_item = AsyncMock(return_value=existing_subcategory)
        mock_container.upsert_item = AsyncMock(return_value={"id": "sub_abc"})
        
        # Act - clear all inference fields
        result = await prompt_service.update_subcategory(
            subcategory_id="sub_abc",
            name="Test",
            prompts={},
            pre=[],
            in_session=[],
            analysis_model=None,
            analysis_reasoning=None,
            analysis_verbosity=None,
        )
        
        # Assert
        upsert_call = mock_container.upsert_item.call_args
        upserted_item = upsert_call[1]["body"]
        
        # All fields should be cleared or None
        assert "analysis_model" not in upserted_item or upserted_item["analysis_model"] is None
        assert "analysis_reasoning" not in upserted_item or upserted_item["analysis_reasoning"] is None
        assert "analysis_verbosity" not in upserted_item or upserted_item["analysis_verbosity"] is None
    
    @pytest.mark.asyncio
    async def test_update_subcategory_preserves_fields_when_not_provided(
        self, prompt_service, mock_cosmos_service
    ):
        """Given subcategory with inference fields, when updating without those params, then keeps existing."""
        # Arrange
        mock_container = MagicMock()
        mock_cosmos_service.get_container.return_value = mock_container
        
        existing_subcategory = {
            "id": "sub_def",
            "type": "prompt_subcategory",
            "category_id": "cat_def",
            "business_unit_id": "bu_def",
            "name": "Test",
            "prompts": {},
            "preSessionTalkingPoints": [],
            "inSessionTalkingPoints": [],
            "analysis_model": "gpt-4o",
            "analysis_reasoning": "high",
            "analysis_verbosity": "medium",
        }
        
        mock_container.read_item = AsyncMock(return_value=existing_subcategory)
        mock_container.upsert_item = AsyncMock(return_value={"id": "sub_def"})
        
        # Act - don't provide inference fields at all
        result = await prompt_service.update_subcategory(
            subcategory_id="sub_def",
            name="Updated Name",
            prompts={},
            pre=[],
            in_session=[],
            # No inference fields provided - should preserve existing
        )
        
        # Assert
        upsert_call = mock_container.upsert_item.call_args
        upserted_item = upsert_call[1]["body"]
        
        # Fields should be preserved when not provided
        assert upserted_item.get("analysis_model") == "gpt-4o"
        assert upserted_item.get("analysis_reasoning") == "high"
        assert upserted_item.get("analysis_verbosity") == "medium"
