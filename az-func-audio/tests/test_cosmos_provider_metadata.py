"""
Tests for CosmosService returning analysis_provider metadata

Tests that get_prompt_metadata() includes the analysis_provider field
when present in the prompt document.
"""

import pytest
from unittest.mock import Mock, MagicMock

from services.cosmos_service import CosmosService


def test_cosmos_service_returns_analysis_provider(app_config, mock_credential):
    """Test that get_prompt_metadata() includes analysis_provider field"""
    mock_container = Mock()
    mock_client = Mock()
    mock_client.get_database_client.return_value.get_container_client.return_value = mock_container
    
    # Prompt document with analysis_provider
    prompt_doc = {
        "id": "prompt-123",
        "type": "prompt_subcategory",
        "analysis_provider": "chat_completions",
        "analysis_model": "gpt-4o",
        "prompts": {"default": "Analyze this..."}
    }
    
    mock_container.query_items.return_value = [prompt_doc]
    
    service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    result = service.get_prompt_metadata("prompt-123")
    
    assert result["analysis_provider"] == "chat_completions"
    assert result["analysis_model"] == "gpt-4o"


def test_cosmos_service_handles_missing_analysis_provider(app_config, mock_credential):
    """Test that get_prompt_metadata() handles missing analysis_provider gracefully"""
    mock_container = Mock()
    mock_client = Mock()
    mock_client.get_database_client.return_value.get_container_client.return_value = mock_container
    
    # Prompt document without analysis_provider (backward compatibility)
    prompt_doc = {
        "id": "prompt-456",
        "type": "prompt_subcategory",
        "analysis_model": "gpt-4o",
        "prompts": {"default": "Analyze this..."}
    }
    
    mock_container.query_items.return_value = [prompt_doc]
    
    service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    result = service.get_prompt_metadata("prompt-456")
    
    # Should not have analysis_provider key
    assert "analysis_provider" not in result
    # But should still have other fields
    assert result["analysis_model"] == "gpt-4o"


def test_cosmos_service_returns_none_for_explicit_none_provider(app_config, mock_credential):
    """Test that get_prompt_metadata() preserves explicit None value"""
    mock_container = Mock()
    mock_client = Mock()
    mock_client.get_database_client.return_value.get_container_client.return_value = mock_container
    
    # Prompt document with explicit None provider
    prompt_doc = {
        "id": "prompt-789",
        "type": "prompt_subcategory",
        "analysis_provider": None,  # Explicitly set to None
        "prompts": {"default": "Analyze this..."}
    }
    
    mock_container.query_items.return_value = [prompt_doc]
    
    service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    result = service.get_prompt_metadata("prompt-789")
    
    # Should preserve None value
    assert "analysis_provider" in result
    assert result["analysis_provider"] is None
