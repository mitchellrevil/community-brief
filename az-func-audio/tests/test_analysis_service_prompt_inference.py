"""
Tests for Phase 4: Analysis Execution Using Prompt Defaults

Tests the ability to pass prompt-level inference settings (model, reasoning, verbosity)
to the analysis service and verify they are correctly passed to the provider.
"""

import pytest
from unittest.mock import Mock

from services.analysis_service import AnalysisService, AnalysisServiceError


# ============================================================================
# Step 1: Tests for Responses API Parsing (CRITICAL)
# ============================================================================

def test_analyze_conversation_parses_nested_output_structure(monkeypatch, app_config, mock_credential):
    """Test that analysis service correctly parses response.output[].content[].text"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Test conversation", None)

    assert result["analysis_text"] == "Analysis result"
    assert result["status"] == "success"


def test_analyze_conversation_raises_error_on_empty_output(monkeypatch, app_config, mock_credential):
    """Test that analysis service raises error when response has empty output array"""
    mock_provider = Mock()
    mock_provider.analyze.side_effect = ValueError("Missing text output in response from OpenAI")
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )

    with pytest.raises(AnalysisServiceError, match="Missing text output in response from OpenAI"):
        svc.analyze_conversation("Test conversation", None)


def test_analyze_conversation_handles_multiple_content_items(monkeypatch, app_config, mock_credential):
    """Test that analysis service correctly extracts text from multiple content items"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Part 1\n\nPart 2"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Test conversation", None)

    assert "Part 1" in result["analysis_text"]
    assert "Part 2" in result["analysis_text"]


def test_analyze_conversation_skips_non_text_content_types(monkeypatch, app_config, mock_credential):
    """Test that analysis service skips content items that aren't output_text"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis text"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Test conversation", None)

    assert result["analysis_text"] == "Analysis text"
    assert "Should be ignored" not in result["analysis_text"]


# ============================================================================
# Step 2: Tests for Analysis Service Parameters
# ============================================================================

def test_analyze_conversation_accepts_inference_parameters(monkeypatch, app_config, mock_credential):
    """Test that analyze_conversation accepts model, reasoning, and verbosity parameters"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )

    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-4o-2024-11-20",
        analysis_reasoning="high",
        analysis_verbosity="detailed"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "gpt-4o-2024-11-20"
    assert call_args[1]["reasoning_effort"] == "high"
    assert call_args[1]["verbosity"] == "detailed"


def test_analyze_conversation_uses_provided_model(monkeypatch, app_config, mock_credential):
    """Test that analyze_conversation uses provided model instead of config default"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="custom-model-123"
    )

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "custom-model-123"


def test_analyze_conversation_uses_provided_reasoning(monkeypatch, app_config, mock_credential):
    """Test that analyze_conversation uses provided reasoning level"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5.1",
        analysis_reasoning="high"
    )

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "high"


def test_analyze_conversation_falls_back_to_config_when_no_params(monkeypatch, app_config, mock_credential):
    """Test that analyze_conversation falls back to config defaults when parameters are OMITTED"""
    app_config.enable_reasoning = True
    app_config.reasoning_level = "medium"
    app_config.azure_openai_deployment = "gpt-5.1"
    
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Test conversation", None)

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "gpt-5.1"
    assert call_args[1]["reasoning_effort"] == "medium"


def test_analyze_conversation_overrides_config_with_explicit_params(monkeypatch, app_config, mock_credential):
    """Test that explicit parameters override config defaults"""
    app_config.enable_reasoning = True
    app_config.reasoning_level = "low"
    app_config.azure_openai_deployment = "default-model"
    
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5-mini",
        analysis_reasoning="high"
    )

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "gpt-5-mini"
    assert call_args[1]["reasoning_effort"] == "high"


def test_analyze_conversation_disables_reasoning_when_none(monkeypatch, app_config, mock_credential):
    """Test that reasoning is disabled when analysis_reasoning is explicitly None"""
    app_config.enable_reasoning = True
    app_config.reasoning_level = "high"
    
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5.1",
        analysis_reasoning=None,
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] is None


# ============================================================================
# Step 3: Tests for Verbosity Parameter (CRITICAL - Phase 4 Fix)
# ============================================================================

def test_analyze_conversation_accepts_verbosity_parameter(monkeypatch, app_config, mock_credential):
    """Test that verbosity parameter is accepted"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )

    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_verbosity="detailed"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["verbosity"] == "detailed"


def test_analyze_conversation_applies_verbosity_to_responses_api(monkeypatch, app_config, mock_credential):
    """Test that verbosity is passed to the provider"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Detailed analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5.1",
        analysis_verbosity="detailed"
    )

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["verbosity"] == "detailed"


def test_analyze_conversation_omits_verbosity_when_not_provided(monkeypatch, app_config, mock_credential):
    """Test that verbosity is None when not provided"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation("Test conversation", None)

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["verbosity"] is None


# ============================================================================
# Model Verbosity Capability Tests
# ============================================================================

def test_verbosity_not_sent_to_incapable_model(monkeypatch, app_config, mock_credential):
    """Test that verbosity parameter is passed to provider (provider handles capability check)"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-4.1",
        analysis_verbosity="detailed"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "gpt-4.1"
    assert call_args[1]["verbosity"] == "detailed"


def test_verbosity_sent_to_capable_model(monkeypatch, app_config, mock_credential):
    """Test that verbosity parameter is passed to provider for capable models"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5.1",
        analysis_verbosity="detailed"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["verbosity"] == "detailed"
    assert call_args[1]["model"] == "gpt-5.1"


# ============================================================================
# Model Reasoning Capability Tests
# ============================================================================

def test_reasoning_not_sent_to_incapable_model(monkeypatch, app_config, mock_credential):
    """Test that reasoning parameter is passed to provider (provider handles capability check)"""
    app_config.enable_reasoning = True
    app_config.reasoning_level = "medium"
    
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-4.1"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["model"] == "gpt-4.1"
    assert call_args[1]["reasoning_effort"] == "medium"


def test_reasoning_sent_to_capable_model(monkeypatch, app_config, mock_credential):
    """Test that reasoning parameter is passed to provider for capable models"""
    app_config.enable_reasoning = True
    app_config.reasoning_level = "high"
    
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-5.1"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "high"
    assert call_args[1]["model"] == "gpt-5.1"


def test_explicit_reasoning_not_sent_to_incapable_model(monkeypatch, app_config, mock_credential):
    """Test that explicit reasoning is passed to provider (provider handles capability check)"""
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis result"
    provider_class = Mock(return_value=mock_provider)

    svc = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry={"responses": provider_class}
    )
    result = svc.analyze_conversation(
        "Test conversation",
        None,
        analysis_model="gpt-4.1",
        analysis_reasoning="high"
    )

    assert result["analysis_text"] == "Analysis result"

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "high"


