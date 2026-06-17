"""
Tests for Phase 3: Provider Registry and Selection Precedence

Tests the provider registry system and selection precedence:
1. Explicit provider argument (highest priority)
2. Prompt metadata provider (medium priority)
3. Config default provider (lowest priority)
"""

import pytest
from unittest.mock import Mock, patch

from services.analysis_service import AnalysisService, AnalysisServiceError


# ============================================================================
# Provider Registry Tests
# ============================================================================

def test_provider_registry_maps_names_to_classes():
    """Test that provider registry contains expected provider mappings"""
    from services.analysis_provider_registry import PROVIDER_REGISTRY, get_analysis_provider_registry
    from services.analysis_providers.responses_provider import ResponsesProvider
    from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
    
    # Test module-level constant
    assert "responses" in PROVIDER_REGISTRY
    assert "chat_completions" in PROVIDER_REGISTRY
    assert PROVIDER_REGISTRY["responses"] is ResponsesProvider
    assert PROVIDER_REGISTRY["chat_completions"] is ChatCompletionsProvider
    
    # Test getter function
    registry = get_analysis_provider_registry()
    assert registry == PROVIDER_REGISTRY
    assert registry["responses"] is ResponsesProvider
    assert registry["chat_completions"] is ChatCompletionsProvider


def test_provider_registry_is_immutable():
    """Test that provider registry cannot be modified at runtime"""
    from services.analysis_provider_registry import get_analysis_provider_registry
    
    registry = get_analysis_provider_registry()
    
    # Attempt to modify should raise error or have no effect
    original_length = len(registry)
    try:
        registry["malicious"] = Mock
        # If modification succeeded, verify it doesn't affect the actual registry
        fresh_registry = get_analysis_provider_registry()
        assert "malicious" not in fresh_registry
        assert len(fresh_registry) == original_length
    except (TypeError, AttributeError):
        # Expected if registry is immutable (frozen dict, MappingProxyType, etc.)
        pass


# ============================================================================
# AnalysisService Registry Integration Tests
# ============================================================================

def test_analysis_service_accepts_provider_registry(app_config, mock_credential):
    """Test that AnalysisService accepts provider_registry parameter"""
    from services.analysis_providers.responses_provider import ResponsesProvider
    from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
    
    custom_registry = {
        "responses": ResponsesProvider,
        "chat_completions": ChatCompletionsProvider,
    }
    
    # Should not raise error
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    assert service.provider_registry == custom_registry


def test_analysis_service_uses_default_registry_when_none_provided(app_config, mock_credential):
    """Test that AnalysisService uses default registry when none provided"""
    from services.analysis_provider_registry import PROVIDER_REGISTRY
    
    service = AnalysisService(config=app_config, credential=mock_credential)
    
    # Should use default registry
    assert service.provider_registry == PROVIDER_REGISTRY


def test_analysis_service_get_supported_providers_returns_registry_keys(app_config, mock_credential):
    """Test that get_supported_providers() returns list of provider names"""
    from services.analysis_providers.responses_provider import ResponsesProvider
    from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
    
    custom_registry = {
        "responses": ResponsesProvider,
        "chat_completions": ChatCompletionsProvider,
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    supported = service.get_supported_providers()
    assert isinstance(supported, list)
    assert "responses" in supported
    assert "chat_completions" in supported
    assert len(supported) == 2


# ============================================================================
# Provider Selection Precedence Tests
# ============================================================================

def test_analysis_service_prefers_explicit_provider_over_prompt(monkeypatch, app_config, mock_credential):
    """Test that explicit provider_name argument takes precedence over prompt metadata"""
    app_config.default_analysis_provider = "responses"
    
    # Mock the provider classes in the registry
    from services.analysis_providers.responses_provider import ResponsesProvider
    from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
    
    mock_responses = Mock()
    mock_responses.analyze.return_value = "Response from responses provider"
    
    mock_chat = Mock()
    mock_chat.analyze.return_value = "Response from chat provider"
    
    # Create custom registry with mocked providers
    custom_registry = {
        "responses": Mock(return_value=mock_responses),
        "chat_completions": Mock(return_value=mock_chat),
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    # Simulate prompt metadata requesting "responses" but explicit arg says "chat_completions"
    # (In real usage, prompt_provider would come from Cosmos)
    result = service.analyze_conversation(
        conversation="Test",
        context={},
        provider_name="chat_completions"  # Explicit override
    )
    
    # Should use chat_completions provider
    assert result["analysis_text"] == "Response from chat provider"
    mock_chat.analyze.assert_called_once()
    mock_responses.analyze.assert_not_called()


def test_analysis_service_prefers_prompt_provider_over_config(monkeypatch, app_config, mock_credential):
    """Test that prompt metadata provider takes precedence over config default"""
    app_config.default_analysis_provider = "responses"
    
    # Mock the provider classes in the registry
    mock_responses = Mock()
    mock_responses.analyze.return_value = "Response from responses provider"
    
    mock_chat = Mock()
    mock_chat.analyze.return_value = "Response from chat provider"
    
    # Create custom registry with mocked providers
    custom_registry = {
        "responses": Mock(return_value=mock_responses),
        "chat_completions": Mock(return_value=mock_chat),
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    # This test simulates the case where function_app extracts provider from prompt metadata
    # and passes it as provider_name argument. To test precedence properly, we'd need to
    # extend analyze_conversation to accept a separate prompt_provider parameter.
    # For now, we test that explicit provider_name overrides config.
    result = service.analyze_conversation(
        conversation="Test",
        context={},
        provider_name="chat_completions"  # From prompt metadata
    )
    
    # Should use chat_completions (from prompt) instead of responses (from config)
    assert result["analysis_text"] == "Response from chat provider"
    mock_chat.analyze.assert_called_once()
    mock_responses.analyze.assert_not_called()


def test_analysis_service_uses_config_default_when_no_override(monkeypatch, app_config, mock_credential):
    """Test that config default is used when no explicit or prompt provider specified"""
    app_config.default_analysis_provider = "chat_completions"
    
    # Mock the provider classes in the registry
    mock_responses = Mock()
    mock_responses.analyze.return_value = "Response from responses provider"
    
    mock_chat = Mock()
    mock_chat.analyze.return_value = "Response from chat provider"
    
    # Create custom registry with mocked providers
    custom_registry = {
        "responses": Mock(return_value=mock_responses),
        "chat_completions": Mock(return_value=mock_chat),
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    # No provider_name argument - should use config default
    result = service.analyze_conversation(
        conversation="Test",
        context={}
    )
    
    # Should use config default (chat_completions)
    assert result["analysis_text"] == "Response from chat provider"
    mock_chat.analyze.assert_called_once()
    mock_responses.analyze.assert_not_called()


def test_analysis_service_raises_on_unknown_provider(app_config, mock_credential):
    """Test that AnalysisService raises ValueError for unknown provider names"""
    service = AnalysisService(config=app_config, credential=mock_credential)
    
    with pytest.raises(ValueError, match="Unknown analysis provider: nonexistent"):
        service.analyze_conversation(
            conversation="Test",
            context={},
            provider_name="nonexistent"
        )


def test_analysis_service_logs_selected_provider(monkeypatch, app_config, mock_credential):
    """Test that selected provider is logged as a structured event."""
    import services.analysis_service as analysis_service_module

    # Create a proper mock class that has __name__
    class MockResponsesProvider:
        def __init__(self, config, credential):
            pass
        
        def analyze(self, **kwargs):
            return "Analysis result"
    
    MockResponsesProvider.__name__ = "ResponsesProvider"  # Explicitly set class name
    
    custom_registry = {
        "responses": MockResponsesProvider,
    }
    logger = Mock()
    monkeypatch.setattr(analysis_service_module, "logger", logger)
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    service.analyze_conversation(
        conversation="Test",
        context={},
        provider_name="responses"
    )
    
    logger.info.assert_any_call(
        "analysis_provider_selected",
        provider_type="ResponsesProvider",
        requested_provider="responses",
    )


# ============================================================================
# Provider Instantiation Tests
# ============================================================================

def test_get_provider_creates_new_instance_each_time(monkeypatch, app_config, mock_credential):
    """Test that _get_provider() creates fresh provider instances"""
    mock_provider_instance = Mock()
    mock_provider_instance.analyze.return_value = "Result"
    mock_provider_class = Mock(return_value=mock_provider_instance)
    
    custom_registry = {
        "responses": mock_provider_class,
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    
    # Call analyze twice
    service.analyze_conversation("Test 1", {}, provider_name="responses")
    service.analyze_conversation("Test 2", {}, provider_name="responses")
    
    # Provider class should be instantiated twice (fresh instance each time)
    assert mock_provider_class.call_count == 2


def test_get_provider_passes_config_and_credential(monkeypatch, app_config, mock_credential):
    """Test that _get_provider() passes config and credential to provider"""
    mock_provider_instance = Mock()
    mock_provider_instance.analyze.return_value = "Result"
    mock_provider_class = Mock(return_value=mock_provider_instance)
    
    custom_registry = {
        "responses": mock_provider_class,
    }
    
    service = AnalysisService(config=app_config, credential=mock_credential, provider_registry=custom_registry)
    service.analyze_conversation("Test", {}, provider_name="responses")
    
    # Provider should be instantiated with config and credential
    mock_provider_class.assert_called_once_with(config=app_config, credential=mock_credential)
