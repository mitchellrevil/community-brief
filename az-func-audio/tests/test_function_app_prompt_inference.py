"""
Tests for function_app.py integration with prompt inference settings.

Tests that the Azure Function retrieves prompt inference settings from Cosmos
and passes them to the analysis service correctly, including fallback behavior.
"""

import pytest
from unittest.mock import Mock
from datetime import datetime
import uuid


@pytest.fixture
def sample_prompt_with_full_inference():
    """Prompt document with all inference settings"""
    return {
        "id": "prompt-with-inference",
        "type": "prompt_subcategory",
        "analysis_model": "gpt-5.1",  # Model that supports both reasoning and verbosity
        "analysis_reasoning": "high",
        "analysis_verbosity": "high",
        "prompts": {
            "default": "Analyze this thoroughly..."
        }
    }


@pytest.fixture
def sample_prompt_without_inference():
    """Prompt document without any inference settings (backward compatibility)"""
    return {
        "id": "prompt-without-inference",
        "type": "prompt_subcategory",
        "prompts": {
            "default": "Analyze this..."
        }
    }


@pytest.fixture
def sample_prompt_with_partial_inference():
    """Prompt document with only some inference settings"""
    return {
        "id": "prompt-partial",
        "type": "prompt_subcategory",
        "analysis_model": "gpt-5-mini",  # Model that supports both reasoning and verbosity
        # No reasoning or verbosity fields
        "prompts": {
            "default": "Quick analysis..."
        }
    }


@pytest.fixture
def sample_prompt_with_none_reasoning():
    """Prompt document with reasoning explicitly set to None (disable)"""
    return {
        "id": "prompt-no-reasoning",
        "type": "prompt_subcategory",
        "analysis_reasoning": None,  # Explicitly disable reasoning
        "prompts": {
            "default": "Fast analysis without reasoning..."
        }
    }


class TestPromptInferenceFallback:
    """Test that function_app.py correctly handles missing inference settings"""
    
    def test_prompt_metadata_with_all_settings_passes_all_to_analysis_service(
        self, monkeypatch, app_config, mock_credential, sample_prompt_with_full_inference
    ):
        """When prompt has all inference settings, they should be passed to analyze_conversation"""
        from services.analysis_service import AnalysisService
        
        mock_provider = Mock()
        mock_provider.analyze.return_value = "Analysis result"
        provider_class = Mock(return_value=mock_provider)

        service = AnalysisService(
            config=app_config,
            credential=mock_credential,
            provider_registry={"responses": provider_class}
        )
        prompt_metadata = sample_prompt_with_full_inference
        
        # Build kwargs conditionally (what function_app.py does)
        kwargs = {
            "conversation": "Test conversation",
            "context": {"user_prompt": "Analyze this thoroughly..."},
        }
        
        # Only add if explicitly present
        if "analysis_model" in prompt_metadata:
            kwargs["analysis_model"] = prompt_metadata["analysis_model"]
        if "analysis_reasoning" in prompt_metadata:
            kwargs["analysis_reasoning"] = prompt_metadata["analysis_reasoning"]
        if "analysis_verbosity" in prompt_metadata:
            kwargs["analysis_verbosity"] = prompt_metadata["analysis_verbosity"]
        
        # ACTUALLY CALL THE SERVICE
        result = service.analyze_conversation(**kwargs)
        
        assert result["analysis_text"] == "Analysis result"
        call_kwargs = mock_provider.analyze.call_args[1]
        assert call_kwargs["model"] == "gpt-5.1"
        assert call_kwargs["reasoning_effort"] == "high"
        assert call_kwargs["verbosity"] == "high"
    
    def test_prompt_metadata_without_settings_uses_config_defaults(
        self, monkeypatch, app_config, mock_credential, sample_prompt_without_inference
    ):
        """When prompt lacks inference settings, analyze_conversation should use config defaults"""
        from services.analysis_service import AnalysisService
        
        # Setup config defaults
        app_config.enable_reasoning = True
        app_config.reasoning_level = "medium"
        app_config.azure_openai_deployment = "gpt-5.1"  # Use a capable model
        
        mock_provider = Mock()
        mock_provider.analyze.return_value = "Analysis result"
        provider_class = Mock(return_value=mock_provider)

        service = AnalysisService(
            config=app_config,
            credential=mock_credential,
            provider_registry={"responses": provider_class}
        )
        prompt_metadata = sample_prompt_without_inference
        
        # Build kwargs conditionally (omit all inference settings)
        kwargs = {
            "conversation": "Test conversation",
            "context": {"user_prompt": "Analyze this..."},
        }
        
        # Don't add any inference settings - they're not in prompt_metadata
        if "analysis_model" in prompt_metadata:
            kwargs["analysis_model"] = prompt_metadata["analysis_model"]
        if "analysis_reasoning" in prompt_metadata:
            kwargs["analysis_reasoning"] = prompt_metadata["analysis_reasoning"]
        if "analysis_verbosity" in prompt_metadata:
            kwargs["analysis_verbosity"] = prompt_metadata["analysis_verbosity"]
        
        # ACTUALLY CALL THE SERVICE
        result = service.analyze_conversation(**kwargs)
        
        assert result["analysis_text"] == "Analysis result"
        call_kwargs = mock_provider.analyze.call_args[1]
        assert call_kwargs["model"] == "gpt-5.1"
        assert call_kwargs["reasoning_effort"] == "medium"
        assert call_kwargs["verbosity"] is None
    
    def test_prompt_metadata_with_partial_settings(
        self, monkeypatch, app_config, mock_credential, sample_prompt_with_partial_inference
    ):
        """When prompt has some settings, only those should override config defaults"""
        from services.analysis_service import AnalysisService
        
        # Setup config defaults
        app_config.enable_reasoning = True
        app_config.reasoning_level = "low"
        app_config.azure_openai_deployment = "gpt-5.1"  # Use a capable model
        
        mock_provider = Mock()
        mock_provider.analyze.return_value = "Analysis result"
        provider_class = Mock(return_value=mock_provider)

        service = AnalysisService(
            config=app_config,
            credential=mock_credential,
            provider_registry={"responses": provider_class}
        )
        prompt_metadata = sample_prompt_with_partial_inference
        
        kwargs = {
            "conversation": "Test conversation",
            "context": {"user_prompt": "Quick analysis..."},
        }
        
        # Only add settings that are present in prompt_metadata
        if "analysis_model" in prompt_metadata:
            kwargs["analysis_model"] = prompt_metadata["analysis_model"]
        if "analysis_reasoning" in prompt_metadata:
            kwargs["analysis_reasoning"] = prompt_metadata["analysis_reasoning"]
        if "analysis_verbosity" in prompt_metadata:
            kwargs["analysis_verbosity"] = prompt_metadata["analysis_verbosity"]
        
        # ACTUALLY CALL THE SERVICE
        result = service.analyze_conversation(**kwargs)
        
        assert result["analysis_text"] == "Analysis result"
        call_kwargs = mock_provider.analyze.call_args[1]
        assert call_kwargs["model"] == "gpt-5-mini"
        assert call_kwargs["reasoning_effort"] == "low"
        assert call_kwargs["verbosity"] is None
    
    def test_prompt_metadata_with_none_reasoning_disables_reasoning(
        self, monkeypatch, app_config, mock_credential, sample_prompt_with_none_reasoning
    ):
        """When reasoning is explicitly None, it should disable reasoning (override config)"""
        from services.analysis_service import AnalysisService
        
        # Config says enable reasoning, but prompt explicitly disables it
        app_config.enable_reasoning = True
        app_config.reasoning_level = "high"
        
        mock_provider = Mock()
        mock_provider.analyze.return_value = "Analysis result"
        provider_class = Mock(return_value=mock_provider)

        service = AnalysisService(
            config=app_config,
            credential=mock_credential,
            provider_registry={"responses": provider_class}
        )
        prompt_metadata = sample_prompt_with_none_reasoning
        
        kwargs = {
            "conversation": "Test conversation",
            "context": {"user_prompt": "Fast analysis without reasoning..."},
        }
        
        # Check if the key exists (not just truthy) - this is critical
        if "analysis_model" in prompt_metadata:
            kwargs["analysis_model"] = prompt_metadata["analysis_model"]
        if "analysis_reasoning" in prompt_metadata:
            # Pass None explicitly to disable reasoning
            kwargs["analysis_reasoning"] = prompt_metadata["analysis_reasoning"]
        if "analysis_verbosity" in prompt_metadata:
            kwargs["analysis_verbosity"] = prompt_metadata["analysis_verbosity"]
        
        # ACTUALLY CALL THE SERVICE
        result = service.analyze_conversation(**kwargs)
        
        assert result["analysis_text"] == "Analysis result"
        call_kwargs = mock_provider.analyze.call_args[1]
        assert call_kwargs["reasoning_effort"] is None


# ============================================================================
# Phase 3: Provider Selection Integration Tests
# ============================================================================

class TestProviderSelectionIntegration:
    """Test that function_app.py correctly extracts and passes provider from prompt metadata"""
    
    def test_function_app_passes_prompt_provider_to_analysis_service(
        self, monkeypatch, app_config, mock_credential
    ):
        """Test that blob trigger extracts analysis_provider from prompt metadata and passes to service"""
        from services.analysis_service import AnalysisService
        from services.cosmos_service import CosmosService
        
        # Mock Cosmos to return prompt with analysis_provider
        mock_cosmos_container = Mock()
        mock_cosmos_client = Mock()
        mock_cosmos_client.get_database_client.return_value.get_container_client.return_value = mock_cosmos_container
        
        prompt_metadata = {
            "id": "prompt-123",
            "type": "prompt_subcategory",
            "analysis_provider": "chat_completions",  # Key field for Phase 3
            "prompts": {"default": "Analyze this..."}
        }
        mock_cosmos_container.query_items.return_value = [prompt_metadata]
        
        cosmos_service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_cosmos_client)
        
        # Simulate function_app logic
        retrieved_metadata = cosmos_service.get_prompt_metadata("prompt-123")
        analysis_provider = retrieved_metadata.get("analysis_provider")
        
        # Verify provider was extracted
        assert analysis_provider == "chat_completions"
        
        # Mock provider using registry
        mock_chat_provider = Mock()
        mock_chat_provider.analyze.return_value = "Analysis result"
        
        custom_registry = {
            "chat_completions": Mock(return_value=mock_chat_provider),
        }
        
        service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
        
        # Simulate function_app calling analyze with provider from prompt
        result = service.analyze_conversation(
            conversation="Test conversation",
            context={"user_prompt": "Analyze this..."},
            provider_name=analysis_provider  # From prompt metadata
        )
        
        assert result["analysis_text"] == "Analysis result"
    
    def test_reprocess_passes_prompt_provider_to_analysis_service(
        self, monkeypatch, app_config, mock_credential
    ):
        """Test that reprocess endpoint extracts and uses provider from prompt metadata"""
        from services.analysis_service import AnalysisService
        from services.cosmos_service import CosmosService
        
        # Mock Cosmos to return prompt with analysis_provider
        mock_cosmos_container = Mock()
        mock_cosmos_client = Mock()
        mock_cosmos_client.get_database_client.return_value.get_container_client.return_value = mock_cosmos_container
        
        prompt_metadata = {
            "id": "prompt-456",
            "type": "prompt_subcategory",
            "analysis_provider": "responses",  # Different provider
            "prompts": {"default": "Quick analysis..."}
        }
        mock_cosmos_container.query_items.return_value = [prompt_metadata]
        
        cosmos_service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_cosmos_client)
        
        # Simulate reprocess logic
        retrieved_metadata = cosmos_service.get_prompt_metadata("prompt-456")
        analysis_provider = retrieved_metadata.get("analysis_provider")
        
        # Verify provider was extracted
        assert analysis_provider == "responses"
        
        # Mock provider using registry
        mock_responses_provider = Mock()
        mock_responses_provider.analyze.return_value = "Reprocess result"
        
        custom_registry = {
            "responses": Mock(return_value=mock_responses_provider),
        }
        
        service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
        
        # Simulate reprocess calling analyze with provider from prompt
        result = service.analyze_conversation(
            conversation="Transcription text",
            context={"user_prompt": "Quick analysis..."},
            provider_name=analysis_provider  # From prompt metadata
        )
        
        assert result["analysis_text"] == "Reprocess result"
    
    def test_function_app_handles_missing_provider_gracefully(
        self, monkeypatch, app_config, mock_credential
    ):
        """Test that function_app handles prompts without analysis_provider field"""
        from services.analysis_service import AnalysisService
        from services.cosmos_service import CosmosService
        
        # Mock Cosmos to return prompt WITHOUT analysis_provider (backward compatibility)
        mock_cosmos_container = Mock()
        mock_cosmos_client = Mock()
        mock_cosmos_client.get_database_client.return_value.get_container_client.return_value = mock_cosmos_container
        
        prompt_metadata = {
            "id": "prompt-legacy",
            "type": "prompt_subcategory",
            # No analysis_provider field
            "prompts": {"default": "Legacy prompt..."}
        }
        mock_cosmos_container.query_items.return_value = [prompt_metadata]
        
        cosmos_service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_cosmos_client)
        
        # Simulate function_app logic
        retrieved_metadata = cosmos_service.get_prompt_metadata("prompt-legacy")
        analysis_provider = retrieved_metadata.get("analysis_provider")  # Will be None
        
        # Should be None (not present in prompt)
        assert analysis_provider is None
        
        # Mock provider and verify config default is used
        app_config.default_analysis_provider = "responses"
        
        mock_responses_provider = Mock()
        mock_responses_provider.analyze.return_value = "Default result"
        
        custom_registry = {
            "responses": Mock(return_value=mock_responses_provider),
        }
        
        service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
        
        # Simulate function_app NOT passing provider_name (should use config default)
        result = service.analyze_conversation(
            conversation="Test",
            context={"user_prompt": "Legacy prompt..."}
            # No provider_name argument - should fall back to config
        )
        
        assert result["analysis_text"] == "Default result"

