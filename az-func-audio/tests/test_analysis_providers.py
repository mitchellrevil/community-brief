"""
Tests for analysis provider implementations and provider_parameters handling.

This module verifies that:
1. ResponsesProvider correctly builds Responses API requests with reasoning/verbosity
2. ResponsesProvider parses nested response.output structure correctly
3. ChatCompletionsProvider builds messages array with proper formatting
4. ChatCompletionsProvider does NOT support reasoning/verbosity parameters
5. AnalysisService correctly handles provider_parameters dict
6. Both providers implement the AnalysisProvider Protocol correctly
"""

import pytest
from unittest.mock import Mock
from typing import Any
import sys
from types import SimpleNamespace

from services.analysis_providers.responses_provider import ResponsesProvider
from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
from services.analysis_service import AnalysisService
from config import AppConfig


# ==================== ResponsesProvider Tests ====================

def test_responses_provider_uses_foundry_token_scope(monkeypatch):
    """Verify managed identity tokens target the Azure OpenAI v1 audience."""
    captured = {}

    def fake_get_bearer_token_provider(credential, scope):
        captured["credential"] = credential
        captured["scope"] = scope
        return lambda: "token"

    monkeypatch.setitem(
        sys.modules,
        "azure.identity",
        SimpleNamespace(get_bearer_token_provider=fake_get_bearer_token_provider),
    )

    credential = Mock()
    provider = ResponsesProvider.__new__(ResponsesProvider)
    token_provider = provider._get_token_provider(credential)

    assert token_provider() == "token"
    assert captured["credential"] is credential
    assert captured["scope"] == "https://ai.azure.com/.default"


def test_responses_provider_builds_managed_identity_v1_client(monkeypatch, app_config, mock_credential):
    """Verify managed identity uses the OpenAI v1 callable-token contract."""
    captured = {}
    token_provider = lambda: "token"

    def fake_openai(**kwargs):
        captured.update(kwargs)
        return Mock()

    monkeypatch.setattr(
        "services.analysis_providers.responses_provider.OpenAI",
        fake_openai,
    )

    provider = ResponsesProvider.__new__(ResponsesProvider)
    provider.config = app_config
    provider.credential = mock_credential
    app_config.azure_openai_api_key = None
    monkeypatch.setattr(provider, "_get_token_provider", Mock(return_value=token_provider))

    client = provider._build_client()

    assert client is not None
    assert captured["base_url"] == "https://test-openai.openai.azure.com/openai/v1"
    assert captured["api_key"] is token_provider


def test_responses_provider_builds_api_key_v1_client(monkeypatch, app_config):
    """Verify API key auth also uses the OpenAI v1 base URL."""
    captured = {}

    def fake_openai(**kwargs):
        captured.update(kwargs)
        return Mock()

    monkeypatch.setattr(
        "services.analysis_providers.responses_provider.OpenAI",
        fake_openai,
    )

    provider = ResponsesProvider.__new__(ResponsesProvider)
    provider.config = app_config
    provider.credential = None
    client = provider._build_client()

    assert client is not None
    assert captured["base_url"] == "https://test-openai.openai.azure.com/openai/v1"
    assert captured["api_key"] == "test-api-key"


def test_responses_provider_builds_request_with_reasoning(app_config):
    """Verify ResponsesProvider sends reasoning.effort to supported models."""
    provider = ResponsesProvider(config=app_config)
    
    conversation = "Meeting transcript here"
    context = {"user_prompt": "Summarize this"}
    model = "gpt-5.1"  # Reasoning-capable model
    reasoning_effort = "medium"
    verbosity = None
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        max_output_tokens=None,
        temperature=None,
        top_p=None
    )
    
    # Should include reasoning parameter
    assert "reasoning" in request
    assert request["reasoning"]["effort"] == "medium"
    assert request["model"] == "gpt-5.1"
    assert "input" in request


def test_responses_provider_builds_request_without_reasoning(app_config):
    """Verify ResponsesProvider omits reasoning for unsupported models."""
    provider = ResponsesProvider(config=app_config)
    
    conversation = "Meeting transcript here"
    context = {"user_prompt": "Summarize this"}
    model = "gpt-4.1"  # Not reasoning-capable
    reasoning_effort = "high"
    verbosity = None
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        max_output_tokens=None,
        temperature=None,
        top_p=None
    )
    
    # Should NOT include reasoning for unsupported model
    assert "reasoning" not in request
    assert request["model"] == "gpt-4.1"


def test_responses_provider_builds_request_with_verbosity(app_config):
    """Verify ResponsesProvider sends text.verbosity to supported models."""
    provider = ResponsesProvider(config=app_config)
    
    conversation = "Meeting transcript here"
    context = ""
    model = "gpt-5-mini"  # Verbosity-capable model
    reasoning_effort = None
    verbosity = "detailed"
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        max_output_tokens=None,
        temperature=None,
        top_p=None
    )
    
    # Should include text.verbosity parameter
    assert "text" in request
    assert request["text"]["verbosity"] == "detailed"


def test_responses_provider_builds_request_with_gpt_5_4_xhigh_reasoning(app_config):
    """Verify GPT-5.4 accepts xhigh reasoning in Responses API requests."""
    provider = ResponsesProvider(config=app_config)

    request = provider.build_request(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.4",
        reasoning_effort="xhigh",
        verbosity="medium",
        max_output_tokens=None,
        temperature=None,
        top_p=None,
    )

    assert request["reasoning"]["effort"] == "xhigh"
    assert request["text"]["verbosity"] == "medium"


def test_responses_provider_builds_request_with_gpt_5_5_xhigh_reasoning(app_config):
    """Verify GPT-5.5 deployments accept xhigh reasoning in Responses API requests."""
    provider = ResponsesProvider(config=app_config)

    request = provider.build_request(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.5-sweden",
        reasoning_effort="xhigh",
        verbosity="medium",
        max_output_tokens=None,
        temperature=None,
        top_p=None,
    )

    assert request["reasoning"]["effort"] == "xhigh"
    assert request["text"]["verbosity"] == "medium"


def test_responses_provider_omits_gpt_5_4_sampling_when_reasoning_enabled(app_config):
    """Verify GPT-5.4 omits temperature/top_p unless reasoning is none."""
    provider = ResponsesProvider(config=app_config)

    request = provider.build_request(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.4",
        reasoning_effort="medium",
        verbosity=None,
        max_output_tokens=None,
        temperature=0.3,
        top_p=0.8,
    )

    assert "temperature" not in request
    assert "top_p" not in request


def test_responses_provider_omits_gpt_5_5_sampling_when_reasoning_enabled(app_config):
    """Verify GPT-5.5 deployments omit temperature/top_p unless reasoning is none."""
    provider = ResponsesProvider(config=app_config)

    request = provider.build_request(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.5-sweden",
        reasoning_effort="medium",
        verbosity=None,
        max_output_tokens=None,
        temperature=0.3,
        top_p=0.8,
    )

    assert "temperature" not in request
    assert "top_p" not in request


def test_responses_provider_builds_request_without_verbosity(app_config):
    """Verify ResponsesProvider omits verbosity for unsupported models."""
    provider = ResponsesProvider(config=app_config)
    
    conversation = "Meeting transcript here"
    context = ""
    model = "gpt-4.1"  # Not verbosity-capable
    reasoning_effort = None
    verbosity = "concise"
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        max_output_tokens=None,
        temperature=None,
        top_p=None
    )
    
    # Should NOT include text parameter for unsupported model
    assert "text" not in request


def test_responses_provider_analyze_returns_output_text(app_config):
    """Verify ResponsesProvider returns response.output_text from the Responses API client."""
    provider = ResponsesProvider(config=app_config)

    mock_response = Mock()
    mock_response.output_text = "This is the analysis result"
    provider.client.responses.create = Mock(return_value=mock_response)

    result = provider.analyze(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.1",
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )

    assert result == "This is the analysis result"


def test_responses_provider_supports_reasoning(app_config):
    """Verify ResponsesProvider capability flag for reasoning returns True."""
    provider = ResponsesProvider(config=app_config)
    
    assert provider.supports_reasoning() is True


def test_responses_provider_supports_verbosity(app_config):
    """Verify ResponsesProvider capability flag for verbosity returns True."""
    provider = ResponsesProvider(config=app_config)
    
    assert provider.supports_verbosity() is True


# ==================== ChatCompletionsProvider Tests ====================

def test_chat_completions_provider_uses_foundry_token_scope(monkeypatch):
    """Verify chat completions managed identity uses the Azure OpenAI v1 audience."""
    captured = {}

    def fake_get_bearer_token_provider(credential, scope):
        captured["credential"] = credential
        captured["scope"] = scope
        return lambda: "token"

    monkeypatch.setitem(
        sys.modules,
        "azure.identity",
        SimpleNamespace(get_bearer_token_provider=fake_get_bearer_token_provider),
    )

    credential = Mock()
    provider = ChatCompletionsProvider.__new__(ChatCompletionsProvider)
    token_provider = provider._get_token_provider(credential)

    assert token_provider() == "token"
    assert captured["credential"] is credential
    assert captured["scope"] == "https://ai.azure.com/.default"


def test_chat_completions_provider_builds_managed_identity_v1_client(monkeypatch, app_config, mock_credential):
    """Verify chat completions uses the OpenAI v1 callable-token contract."""
    captured = {}
    token_provider = lambda: "token"

    def fake_openai(**kwargs):
        captured.update(kwargs)
        return Mock()

    monkeypatch.setattr(
        "services.analysis_providers.chat_completions_provider.OpenAI",
        fake_openai,
    )

    provider = ChatCompletionsProvider.__new__(ChatCompletionsProvider)
    provider.config = app_config
    provider.credential = mock_credential
    app_config.azure_openai_api_key = None
    monkeypatch.setattr(provider, "_get_token_provider", Mock(return_value=token_provider))

    client = provider._build_client()

    assert client is not None
    assert captured["base_url"] == "https://test-openai.openai.azure.com/openai/v1"
    assert captured["api_key"] is token_provider


def test_chat_completions_provider_builds_messages_array(app_config):
    """Verify ChatCompletionsProvider builds proper messages array with system/user roles."""
    provider = ChatCompletionsProvider(config=app_config)
    
    conversation = "Meeting transcript here"
    context = {"user_prompt": "Summarize this"}
    model = "gpt-4.1"
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    # Should have messages array
    assert "messages" in request
    assert isinstance(request["messages"], list)
    assert len(request["messages"]) >= 2
    
    # First message should be system prompt
    assert request["messages"][0]["role"] == "system"
    assert "meeting analyst" in request["messages"][0]["content"].lower()
    
    # Should have user message with transcript
    transcript_msg = [m for m in request["messages"] if "TRANSCRIPT:" in m.get("content", "")]
    assert len(transcript_msg) == 1
    assert "Meeting transcript here" in transcript_msg[0]["content"]


def test_chat_completions_provider_formats_context_as_messages(app_config):
    """Verify ChatCompletionsProvider injects context into messages array."""
    provider = ChatCompletionsProvider(config=app_config)
    
    conversation = "Meeting content"
    context = {
        "user_prompt": "Create action items",
        "instructions": "Focus on decisions"
    }
    model = "gpt-4.1"
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    messages = request["messages"]
    
    # Should have context message
    context_msgs = [m for m in messages if "USER PROMPT:" in m.get("content", "")]
    assert len(context_msgs) >= 1
    assert "Create action items" in context_msgs[0]["content"]


def test_chat_completions_provider_sets_temperature_and_max_tokens(app_config):
    """Verify ChatCompletionsProvider forwards temperature and max_tokens when provided."""
    provider = ChatCompletionsProvider(config=app_config)
    
    conversation = "Meeting transcript"
    context = ""
    model = "gpt-4.1"
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=0.4,
        max_tokens=1200,
        top_p=None
    )
    
    assert request["temperature"] == 0.4
    assert request["max_tokens"] == 1200


def test_chat_completions_provider_parses_response_content(app_config):
    """Verify ChatCompletionsProvider extracts text from response.choices[0].message.content."""
    provider = ChatCompletionsProvider(config=app_config)
    
    # Mock chat completion response
    mock_response = Mock()
    mock_choice = Mock()
    mock_message = Mock()
    mock_message.content = "Analysis result from chat completions"
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    result = provider.parse_response(mock_response)
    
    assert result == "Analysis result from chat completions"


def test_chat_completions_provider_does_not_support_reasoning(app_config):
    """Verify ChatCompletionsProvider capability flag for reasoning returns False."""
    provider = ChatCompletionsProvider(config=app_config)
    
    assert provider.supports_reasoning() is False


def test_chat_completions_provider_does_not_support_verbosity(app_config):
    """Verify ChatCompletionsProvider capability flag for verbosity returns False."""
    provider = ChatCompletionsProvider(config=app_config)
    
    assert provider.supports_verbosity() is False


def test_chat_completions_provider_ignores_reasoning_parameter(app_config):
    """Verify ChatCompletionsProvider does not include reasoning in request even if provided."""
    provider = ChatCompletionsProvider(config=app_config)
    
    conversation = "Meeting transcript"
    context = ""
    model = "gpt-4.1"
    reasoning = "high"  # Should be ignored
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=reasoning,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    # Should NOT include reasoning parameter
    assert "reasoning" not in request


def test_chat_completions_provider_ignores_verbosity_parameter(app_config):
    """Verify ChatCompletionsProvider does not include text.verbosity in request even if provided."""
    provider = ChatCompletionsProvider(config=app_config)
    
    conversation = "Meeting transcript"
    context = ""
    model = "gpt-4.1"
    verbosity = "detailed"  # Should be ignored
    
    request = provider.build_request(
        conversation=conversation,
        context=context,
        model=model,
        reasoning_effort=None,
        verbosity=verbosity,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    # Should NOT include text parameter
    assert "text" not in request


# ==================== Integration Tests with AnalysisService ====================

def test_analysis_service_delegates_to_responses_provider(app_config):
    """Verify AnalysisService uses ResponsesProvider when provider_name='responses'."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Test analysis result"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    result = service.analyze_conversation(
        conversation="Meeting transcript",
        context="Test context",
        provider_name="responses"
    )

    assert result["status"] == "success"
    assert result["analysis_text"] == "Test analysis result"
    assert mock_provider.analyze.called

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["conversation"] == "Meeting transcript"
    assert call_args[1]["context"] == "Test context"


def test_analysis_service_delegates_to_chat_completions_provider(app_config):
    """Verify AnalysisService uses ChatCompletionsProvider when provider_name='chat_completions'."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Chat completions analysis"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"chat_completions": provider_class}
    )
    result = service.analyze_conversation(
        conversation="Meeting transcript",
        context="Test context",
        provider_name="chat_completions"
    )

    assert result["status"] == "success"
    assert result["analysis_text"] == "Chat completions analysis"
    assert mock_provider.analyze.called

    call_args = mock_provider.analyze.call_args
    assert call_args[1]["conversation"] == "Meeting transcript"
    assert call_args[1]["context"] == "Test context"


# =====================================================================
# Tests for provider_parameters handling
# =====================================================================

def test_analysis_service_uses_provider_parameters_dict(app_config):
    """Verify AnalysisService uses provider_parameters when provided."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis with params"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    provider_params = {
        "reasoning_effort": "high",
        "max_output_tokens": 2000,
        "verbosity": "detailed",
        "temperature": 0.2,
        "top_p": 0.7
    }
    result = service.analyze_conversation(
        conversation="Test conversation",
        context="Test context",
        provider_name="responses",
        provider_parameters=provider_params
    )

    assert mock_provider.analyze.called
    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "high"
    assert call_args[1]["max_output_tokens"] == 2000
    assert call_args[1]["verbosity"] == "detailed"
    assert call_args[1]["temperature"] == 0.2
    assert call_args[1]["top_p"] == 0.7


def test_analysis_service_falls_back_to_individual_args_without_provider_parameters(app_config):
    """Verify AnalysisService falls back to individual args when provider_parameters is None."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis with fallback"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    result = service.analyze_conversation(
        conversation="Test conversation",
        context="Test context",
        provider_name="responses",
        analysis_reasoning="medium",
        provider_parameters=None
    )

    assert mock_provider.analyze.called
    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "medium"


def test_analysis_service_provider_parameters_takes_precedence(app_config):
    """Verify provider_parameters takes precedence over individual args."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis with precedence"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    provider_params = {"reasoning_effort": "high", "max_output_tokens": 2500}
    result = service.analyze_conversation(
        conversation="Test conversation",
        context="Test context",
        provider_name="responses",
        analysis_reasoning="low",  # Should be ignored
        provider_parameters=provider_params  # Should take precedence
    )

    assert mock_provider.analyze.called
    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] == "high"
    assert call_args[1]["max_output_tokens"] == 2500


def test_analysis_service_empty_provider_parameters_falls_back(app_config):
    """Verify empty provider_parameters dict falls back to config defaults."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis with defaults"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    result = service.analyze_conversation(
        conversation="Test conversation",
        context="Test context",
        provider_name="responses",
        provider_parameters={}
    )

    assert mock_provider.analyze.called
    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] is None
    assert call_args[1]["max_output_tokens"] is None


def test_analysis_service_uses_config_defaults_when_no_parameters(app_config):
    """Verify AnalysisService uses config defaults when no parameters provided."""
    from services.analysis_service import AnalysisService
    from unittest.mock import Mock

    mock_provider = Mock()
    mock_provider.analyze.return_value = "Analysis with all defaults"
    provider_class = Mock(return_value=mock_provider)

    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    result = service.analyze_conversation(
        conversation="Test conversation",
        context="Test context",
        provider_name="responses"
    )

    assert mock_provider.analyze.called
    call_args = mock_provider.analyze.call_args
    assert call_args[1]["reasoning_effort"] is None
    assert call_args[1]["max_output_tokens"] is None
    assert call_args[1]["verbosity"] is None
