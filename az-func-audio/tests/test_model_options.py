import json
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
from openai import OpenAI
import pytest

from services.analysis_service import AnalysisService
from services.analysis_providers.responses_provider import ResponsesProvider
from services.analysis_providers.chat_completions_provider import (
    ChatCompletionsProvider,
)
from services.model_options import resolve_model_options


@pytest.mark.parametrize(
    "provider_name,provider_type",
    [("responses", ResponsesProvider), ("chat_completions", ChatCompletionsProvider)],
)
def test_new_arguments_reach_real_sdk_http_body(provider_name, provider_type):
    bodies = []

    def receive(request):
        bodies.append(json.loads(request.content))
        if provider_name == "responses":
            return httpx.Response(
                200,
                json={
                    "id": "resp_test",
                    "object": "response",
                    "output": [
                        {
                            "type": "message",
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": "Summary",
                                    "annotations": [],
                                }
                            ],
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "chat_test",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Summary"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    provider = provider_type.__new__(provider_type)
    provider.client = OpenAI(
        api_key="test-only",
        base_url="https://test.invalid/openai/v1",
        http_client=httpx.Client(transport=httpx.MockTransport(receive)),
    )
    config = SimpleNamespace(
        default_analysis_provider=provider_name, azure_openai_deployment="default"
    )
    service = AnalysisService(
        config, provider_registry={provider_name: lambda **_: provider}
    )
    arguments = (
        {
            "new_nested_option": {"enabled": True, "levels": [1, 2]},
            "new_number": 12,
            "reasoning_effort": "high",
        }
        if provider_name == "responses"
        else {"new_nested_option": {"enabled": True, "levels": [1, 2]}, "seed": 42}
    )
    result = service.analyze_conversation(
        "Transcript",
        {"user_prompt": "Template instructions"},
        analysis_model="future-deployment",
        provider_name=provider_name,
        provider_parameters=arguments,
    )
    assert result["analysis_text"] == "Summary"
    assert bodies[0]["model"] == "future-deployment"
    assert bodies[0]["new_nested_option"] == arguments["new_nested_option"]
    assert "extra_body" not in bodies[0]
    if provider_name == "responses":
        assert bodies[0]["reasoning"] == {"effort": "high"}
        assert "reasoning_effort" not in bodies[0]
    else:
        assert bodies[0]["seed"] == 42


def test_nested_defaults_merge_without_mutating_catalogue():
    model = {
        "request_defaults": {
            "reasoning": {"effort": "high", "summary": "auto"},
            "new_flag": True,
        },
        "parameters": {"reasoning": {"kind": "object"}},
    }
    result = resolve_model_options(model, {"reasoning": {"effort": "low"}})
    assert result == {
        "reasoning": {"effort": "low", "summary": "auto"},
        "new_flag": True,
    }
    assert model["request_defaults"]["reasoning"]["effort"] == "high"


def test_nested_override_takes_precedence_over_legacy_default_alias():
    model = {
        "request_defaults": {"reasoning_effort": "high"},
        "parameters": {"reasoning": {"kind": "object"}},
    }
    assert resolve_model_options(model, {"reasoning": {"effort": "low"}}) == {
        "reasoning": {"effort": "low"}
    }


@pytest.mark.parametrize(
    "field", ["input", "model", "api_key", "extra_body", "stream", "tools"]
)
def test_invalid_runtime_catalogue_cannot_override_owned_fields(field):
    with pytest.raises(ValueError, match="managed by Community Brief"):
        resolve_model_options({"request_defaults": {field: "override"}}, {})


def test_runtime_revalidates_types_after_catalogue_changes():
    with pytest.raises(ValueError, match="integer"):
        resolve_model_options(
            {"parameters": {"seed": {"kind": "integer"}}}, {"seed": 1.5}
        )


@pytest.mark.parametrize(
    "provider_name,class_name",
    [
        ("responses", "OpenAIChatClient"),
        ("chat_completions", "OpenAIChatCompletionClient"),
    ],
)
def test_structured_review_uses_selected_deployment_and_arguments(
    monkeypatch, provider_name, class_name
):
    import agent_framework.openai as clients
    from agent.client import build_template_agents

    client = Mock()
    factory = Mock(return_value=client)
    monkeypatch.setattr(clients, class_name, factory)
    config = SimpleNamespace(
        azure_openai_endpoint="https://test.openai.azure.com",
        azure_openai_deployment="old-default",
        azure_openai_api_key="test-only",
    )
    build_template_agents(
        config,
        {
            "analysis_model": "new-deployment",
            "provider_name": provider_name,
            "provider_parameters": {"future_option": {"enabled": True}},
        },
    )
    assert factory.call_args.kwargs["model"] == "new-deployment"
    assert len(client.as_agent.call_args_list) == 3
    for call in client.as_agent.call_args_list:
        assert call.kwargs["default_options"] == {
            "extra_body": {"future_option": {"enabled": True}}
        }
