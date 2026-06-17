"""
Unit tests for router sentinel pattern - Phase 2 fix.

Tests that the update_subcategory router endpoint properly uses the
_NOT_PROVIDED sentinel pattern for partial updates of inference fields.

ISSUE: Router always passes subcategory.analysis_model (etc.) to service,
which are None when omitted → service treats as "clear field" instead of
"preserve existing value".

FIX: Router should check which fields were provided and pass _NOT_PROVIDED
for fields that were not included in the request.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.routes import prompts as prompts_mod
from app.services.prompts.prompt_service import _NOT_PROVIDED
from app.schemas.prompts import SubcategoryUpdate


pytestmark = pytest.mark.unit


@pytest.mark.asyncio
async def test_update_subcategory_without_inference_fields_uses_sentinel():
    """
    When updating a subcategory WITHOUT providing inference fields,
    the router should pass _NOT_PROVIDED to the service (not None).
    
    This allows the service to preserve existing values instead of clearing them.
    """
    # Setup mocks
    mock_prompt_service = AsyncMock()
    mock_perm_service = MagicMock()
    mock_talking_points_service = MagicMock()
    mock_prompt_version_service = MagicMock()
    mock_prompt_version_service.create_version_snapshot = AsyncMock()
    
    # Existing subcategory with inference fields
    existing = {
        "id": "sub_123",
        "category_id": "cat_123",
        "business_unit_id": "bu_123",
        "name": "Original",
        "prompts": {"key": "value"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-4o",
        "analysis_reasoning": "high",
        "analysis_verbosity": "medium",
        "analysis_provider": "chat_completions",
        "provider_parameters": {"temperature": 0.4},
    }
    
    mock_prompt_service.get_subcategory.return_value = existing
    mock_perm_service.set_prompt_service = MagicMock()
    mock_perm_service.can_edit_prompt = AsyncMock(return_value=True)
    mock_talking_points_service.validate_talking_points_structure.return_value = []
    mock_talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    
    # Updated subcategory preserves inference fields
    updated = existing.copy()
    updated["name"] = "Updated"
    mock_prompt_service.update_subcategory.return_value = updated
    
    subcategory_update = SubcategoryUpdate(
        name="Updated",
        prompts={"key": "value"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
    )
    
    # Execute
    result = await prompts_mod.update_subcategory(
        subcategory_id="sub_123",
        subcategory=subcategory_update,
        current_user={"id": "u1", "permission": "Editor"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=mock_perm_service,
        talking_points_service=mock_talking_points_service,
        prompt_version_service=mock_prompt_version_service,
    )
    
    # Verify: Service was called with _NOT_PROVIDED for omitted inference fields
    call_args = mock_prompt_service.update_subcategory.call_args
    assert call_args is not None, "update_subcategory must be called"
    
    # Arguments: (subcategory_id, name, prompts, pre, in_session,
    #             analysis_model, analysis_reasoning, analysis_verbosity,
    #             analysis_provider, provider_parameters)
    args = call_args[0]
    
    # These should be _NOT_PROVIDED (not None) because they weren't in the request
    assert args[5] is _NOT_PROVIDED, "analysis_model should be _NOT_PROVIDED when omitted"
    assert args[6] is _NOT_PROVIDED, "analysis_reasoning should be _NOT_PROVIDED when omitted"
    assert args[7] is _NOT_PROVIDED, "analysis_verbosity should be _NOT_PROVIDED when omitted"
    assert args[8] is _NOT_PROVIDED, "analysis_provider should be _NOT_PROVIDED when omitted"
    assert args[9] is _NOT_PROVIDED, "provider_parameters should be _NOT_PROVIDED when omitted"
    
    # Result should preserve inference fields
    assert result["analysis_model"] == "gpt-4o"
    assert result["analysis_reasoning"] == "high"
    assert result["analysis_verbosity"] == "medium"


@pytest.mark.asyncio
async def test_update_subcategory_with_explicit_null_passes_none():
    """
    When updating a subcategory WITH inference fields explicitly set to null,
    the router should pass None to the service (not _NOT_PROVIDED).
    
    This allows the service to clear those fields.
    """
    # Setup mocks
    mock_prompt_service = AsyncMock()
    mock_perm_service = MagicMock()
    mock_talking_points_service = MagicMock()
    mock_prompt_version_service = MagicMock()
    mock_prompt_version_service.create_version_snapshot = AsyncMock()
    
    # Existing subcategory with inference fields
    existing = {
        "id": "sub_456",
        "category_id": "cat_456",
        "business_unit_id": "bu_456",
        "name": "Original",
        "prompts": {"key": "value"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-4o",
        "analysis_reasoning": "high",
        "analysis_verbosity": "medium",
        "analysis_provider": "chat_completions",
        "provider_parameters": {"temperature": 0.4},
    }
    
    mock_prompt_service.get_subcategory.return_value = existing
    mock_perm_service.set_prompt_service = MagicMock()
    mock_perm_service.can_edit_prompt = AsyncMock(return_value=True)
    mock_talking_points_service.validate_talking_points_structure.return_value = []
    mock_talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    
    # Updated subcategory clears inference fields
    updated = existing.copy()
    updated["name"] = "Updated"
    del updated["analysis_model"]
    del updated["analysis_reasoning"]
    del updated["analysis_verbosity"]
    mock_prompt_service.update_subcategory.return_value = updated
    
    subcategory_update = SubcategoryUpdate(
        name="Updated",
        prompts={"key": "value"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
        analysis_model=None,
        analysis_reasoning=None,
        analysis_verbosity=None,
        analysis_provider=None,
        provider_parameters=None,
    )
    
    # Execute
    result = await prompts_mod.update_subcategory(
        subcategory_id="sub_456",
        subcategory=subcategory_update,
        current_user={"id": "u1", "permission": "Editor"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=mock_perm_service,
        talking_points_service=mock_talking_points_service,
        prompt_version_service=mock_prompt_version_service,
    )
    
    # Verify: Service was called with None for explicitly-null inference fields
    call_args = mock_prompt_service.update_subcategory.call_args
    assert call_args is not None, "update_subcategory must be called"
    
    # Arguments: (subcategory_id, name, prompts, pre, in_session,
    #             analysis_model, analysis_reasoning, analysis_verbosity,
    #             analysis_provider, provider_parameters)
    args = call_args[0]
    
    # These should be None (not _NOT_PROVIDED) because they were explicitly null in request
    assert args[5] is None, "analysis_model should be None when explicitly null"
    assert args[6] is None, "analysis_reasoning should be None when explicitly null"
    assert args[7] is None, "analysis_verbosity should be None when explicitly null"
    assert args[8] is None, "analysis_provider should be None when explicitly null"
    assert args[9] is None, "provider_parameters should be None when explicitly null"
    
    # Result should have cleared inference fields
    assert "analysis_model" not in result
    assert "analysis_reasoning" not in result
    assert "analysis_verbosity" not in result


@pytest.mark.asyncio
async def test_update_subcategory_with_value_passes_value():
    """
    When updating a subcategory WITH inference fields set to a new value,
    the router should pass that value to the service.
    """
    # Setup mocks
    mock_prompt_service = AsyncMock()
    mock_perm_service = MagicMock()
    mock_talking_points_service = MagicMock()
    mock_prompt_version_service = MagicMock()
    mock_prompt_version_service.create_version_snapshot = AsyncMock()
    
    # Existing subcategory
    existing = {
        "id": "sub_789",
        "category_id": "cat_789",
        "business_unit_id": "bu_789",
        "name": "Original",
        "prompts": {"key": "value"},
        "preSessionTalkingPoints": [],
        "inSessionTalkingPoints": [],
        "analysis_model": "gpt-4o",
        "analysis_reasoning": "low",
        "analysis_verbosity": "low",
        "analysis_provider": "chat_completions",
        "provider_parameters": {"temperature": 0.2},
    }
    
    mock_prompt_service.get_subcategory.return_value = existing
    mock_perm_service.set_prompt_service = MagicMock()
    mock_perm_service.can_edit_prompt = AsyncMock(return_value=True)
    mock_talking_points_service.validate_talking_points_structure.return_value = []
    mock_talking_points_service.ensure_talking_points_structure.side_effect = lambda x: x
    
    # Updated subcategory with new inference field values
    updated = existing.copy()
    updated["name"] = "Updated"
    updated["analysis_model"] = "gpt-5.1"
    updated["analysis_reasoning"] = "high"
    updated["analysis_verbosity"] = "medium"
    updated["analysis_provider"] = "responses"
    updated["provider_parameters"] = {"reasoning_effort": "high"}
    mock_prompt_service.update_subcategory.return_value = updated
    
    subcategory_update = SubcategoryUpdate(
        name="Updated",
        prompts={"key": "value"},
        preSessionTalkingPoints=[],
        inSessionTalkingPoints=[],
        analysis_model="gpt-5.1",
        analysis_reasoning="high",
        analysis_verbosity="medium",
        analysis_provider="responses",
        provider_parameters={"reasoning_effort": "high"},
    )
    
    # Execute
    result = await prompts_mod.update_subcategory(
        subcategory_id="sub_789",
        subcategory=subcategory_update,
        current_user={"id": "u1", "permission": "Editor"},
        auth_context="editor",
        prompt_service=mock_prompt_service,
        perm_service=mock_perm_service,
        talking_points_service=mock_talking_points_service,
        prompt_version_service=mock_prompt_version_service,
    )
    
    # Verify: Service was called with new values for inference fields
    call_args = mock_prompt_service.update_subcategory.call_args
    assert call_args is not None, "update_subcategory must be called"
    
    args = call_args[0]
    
    # These should be the new values from the request
    assert args[5] == "gpt-5.1", "analysis_model should be new value"
    assert args[6] == "high", "analysis_reasoning should be new value"
    assert args[7] == "medium", "analysis_verbosity should be new value"
    assert args[8] == "responses", "analysis_provider should be new value"
    assert args[9] == {"reasoning_effort": "high"}, "provider_parameters should be new value"
    
    # Result should have updated inference fields
    assert result["analysis_model"] == "gpt-5.1"
    assert result["analysis_reasoning"] == "high"
    assert result["analysis_verbosity"] == "medium"
    assert result["analysis_provider"] == "responses"
    assert result["provider_parameters"] == {"reasoning_effort": "high"}
