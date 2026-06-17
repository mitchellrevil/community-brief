"""
Integration tests for inference configuration persistence in PromptService.

Tests that analysis_model, analysis_reasoning, analysis_verbosity, analysis_provider,
and provider_parameters fields are correctly stored, retrieved, and serialized.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.api.v1.routes import prompts as prompts_mod
from backend_app.app.schemas.prompts import SubcategoryCreate, SubcategoryUpdate


@pytest.mark.asyncio
async def test_create_subcategory_stores_inference_fields():
    """Creating a subcategory should persist inference configuration fields."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "cat1", "business_unit_id": "bu1"}
    mock_prompt_service.create_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Test Sub",
        "prompts": {"key1": "prompt1"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-4o",
        "analysis_reasoning": "high",
        "analysis_verbosity": "medium",
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    prompt_version_service = MagicMock()
    prompt_version_service.create_version_snapshot = AsyncMock()

    subcategory = SubcategoryCreate(
        category_id="cat1",
        name="Test Sub",
        prompts={"key1": "prompt1"},
        analysis_model="gpt-4o",
        analysis_reasoning="high",
        analysis_verbosity="medium",
    )

    result = await prompts_mod.create_subcategory(
        subcategory=subcategory,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    )

    # Verify the service was called with inference fields
    mock_prompt_service.create_subcategory.assert_called_once()
    call_args = mock_prompt_service.create_subcategory.call_args

    # Check that result contains inference fields
    assert result["analysis_model"] == "gpt-4o"
    assert result["analysis_reasoning"] == "high"
    assert result["analysis_verbosity"] == "medium"


@pytest.mark.asyncio
async def test_update_subcategory_updates_inference_fields():
    """Updating a subcategory should persist changes to inference configuration fields."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Existing Sub",
        "business_unit_id": "bu1",
    }
    mock_prompt_service.update_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Updated Sub",
        "prompts": {"key2": "prompt2"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-5.1",
        "analysis_reasoning": "low",
        "analysis_verbosity": "low",
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    prompt_version_service = MagicMock()
    prompt_version_service.create_version_snapshot = AsyncMock()

    subcategory_update = SubcategoryUpdate(
        name="Updated Sub",
        prompts={"key2": "prompt2"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
        analysis_model="gpt-5.1",
        analysis_reasoning="low",
        analysis_verbosity="low",
    )

    result = await prompts_mod.update_subcategory(
        subcategory_id="sub1",
        subcategory=subcategory_update,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    )

    # Verify the result contains updated inference fields
    assert result["analysis_model"] == "gpt-5.1"
    assert result["analysis_reasoning"] == "low"
    assert result["analysis_verbosity"] == "low"


@pytest.mark.asyncio
async def test_get_subcategory_returns_inference_fields():
    """Getting a subcategory should return inference configuration fields if present."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "type": "prompt_subcategory",
        "category_id": "cat1",
        "name": "Test Sub",
        "prompts": {"key1": "prompt1"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-4o-mini",
        "analysis_reasoning": "medium",
        "analysis_verbosity": "high",
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    talking_points_service = MagicMock()
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    result = await prompts_mod.get_subcategory(
        subcategory_id="sub1",
        current_user={"id": "u1"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        talking_points_service=talking_points_service,
    )

    assert result["analysis_model"] == "gpt-4o-mini"
    assert result["analysis_reasoning"] == "medium"
    assert result["analysis_verbosity"] == "high"


@pytest.mark.asyncio
async def test_legacy_subcategory_without_inference_fields_works():
    """Legacy subcategories without inference fields should still work."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "type": "prompt_subcategory",
        "category_id": "cat1",
        "name": "Legacy Sub",
        "prompts": {"key1": "prompt1"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    talking_points_service = MagicMock()
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    result = await prompts_mod.get_subcategory(
        subcategory_id="sub1",
        current_user={"id": "u1"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        talking_points_service=talking_points_service,
    )

    # Legacy subcategories should have None for inference fields
    assert result.get("analysis_model") is None
    assert result.get("analysis_reasoning") is None
    assert result.get("analysis_verbosity") is None


@pytest.mark.asyncio
async def test_create_subcategory_stores_provider_fields():
    """Creating a subcategory should persist provider and provider_parameters."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_category.return_value = {"id": "cat1", "business_unit_id": "bu1"}
    mock_prompt_service.create_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Test Sub",
        "prompts": {"key1": "prompt1"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_provider": "responses",
        "provider_parameters": {"reasoning_effort": "high", "verbosity": "medium"},
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_category = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    prompt_version_service = MagicMock()
    prompt_version_service.create_version_snapshot = AsyncMock()

    subcategory = SubcategoryCreate(
        category_id="cat1",
        name="Test Sub",
        prompts={"key1": "prompt1"},
        analysis_provider="responses",
        provider_parameters={"reasoning_effort": "high", "verbosity": "medium"},
    )

    result = await prompts_mod.create_subcategory(
        subcategory=subcategory,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    )

    # Verify the service was called with provider fields
    mock_prompt_service.create_subcategory.assert_called_once()
    
    # Check that result contains provider fields
    assert result["analysis_provider"] == "responses"
    assert result["provider_parameters"] == {"reasoning_effort": "high", "verbosity": "medium"}


@pytest.mark.asyncio
async def test_update_subcategory_updates_provider_fields():
    """Updating a subcategory should persist changes to provider fields."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Existing Sub",
        "business_unit_id": "bu1",
    }
    mock_prompt_service.update_subcategory.return_value = {
        "id": "sub1",
        "category_id": "cat1",
        "name": "Updated Sub",
        "prompts": {"key2": "prompt2"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_provider": "chat_completions",
        "provider_parameters": {"temperature": 0.7, "max_tokens": 1000},
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    perm = MagicMock()
    perm.set_prompt_service = MagicMock()
    perm.can_edit_prompt = AsyncMock(return_value=True)

    talking_points_service = MagicMock()
    talking_points_service.validate_talking_points_structure.return_value = []
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    prompt_version_service = MagicMock()
    prompt_version_service.create_version_snapshot = AsyncMock()

    subcategory_update = SubcategoryUpdate(
        name="Updated Sub",
        prompts={"key2": "prompt2"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
        analysis_provider="chat_completions",
        provider_parameters={"temperature": 0.7, "max_tokens": 1000},
    )

    result = await prompts_mod.update_subcategory(
        subcategory_id="sub1",
        subcategory=subcategory_update,
        current_user={"id": "u1"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=perm,
        talking_points_service=talking_points_service,
        prompt_version_service=prompt_version_service,
    )

    # Verify the result contains updated provider fields
    assert result["analysis_provider"] == "chat_completions"
    assert result["provider_parameters"] == {"temperature": 0.7, "max_tokens": 1000}


@pytest.mark.asyncio
async def test_get_subcategory_returns_provider_fields():
    """Getting a subcategory should return provider fields if present."""
    mock_prompt_service = AsyncMock()
    mock_prompt_service.get_subcategory.return_value = {
        "id": "sub1",
        "type": "prompt_subcategory",
        "category_id": "cat1",
        "name": "Test Sub",
        "prompts": {"key1": "prompt1"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_provider": "responses",
        "provider_parameters": {"reasoning_effort": "high"},
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "business_unit_id": "bu1",
    }

    talking_points_service = MagicMock()
    talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x

    result = await prompts_mod.get_subcategory(
        subcategory_id="sub1",
        current_user={"id": "u1"},
        auth_context="user",
        prompt_service=mock_prompt_service,
        talking_points_service=talking_points_service,
    )

    assert result["analysis_provider"] == "responses"
    assert result["provider_parameters"] == {"reasoning_effort": "high"}
