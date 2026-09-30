import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.schemas.inference_catalog import ModelConnectionRequest
from app.services import inference_connection_service as module


@pytest.fixture
def probe(monkeypatch):
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.responses.create.return_value = SimpleNamespace(status="completed")
    factory = Mock(return_value=client)
    monkeypatch.setattr(module, "AsyncOpenAI", factory)
    service = module.InferenceConnectionService(
        azure_endpoint="https://configured.openai.azure.com/",
        api_key="server-secret",
    )
    return service, client, factory


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["responses", "chat_completions"])
async def test_probe_uses_only_configured_auth_and_a_fixed_bounded_request(
    probe, provider
):
    service, client, factory = probe
    request = ModelConnectionRequest(deployment="deployment-blue", provider=provider)

    result = await service.test_connection(request)

    assert result.status == "success"
    factory.assert_called_once_with(
        api_key="server-secret",
        base_url="https://configured.openai.azure.com/openai/v1",
        timeout=20,
        max_retries=0,
    )
    if provider == "responses":
        client.responses.create.assert_awaited_once_with(
            model="deployment-blue",
            input="Reply with OK.",
            max_output_tokens=16,
            store=False,
        )
        client.chat.completions.create.assert_not_awaited()
    else:
        client.chat.completions.create.assert_awaited_once_with(
            model="deployment-blue",
            messages=[{"role": "user", "content": "Reply with OK."}],
            max_completion_tokens=16,
            store=False,
        )
        client.responses.create.assert_not_awaited()
    client.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_probe_uses_async_managed_identity_when_no_key_is_configured(
    probe, monkeypatch
):
    service, client, factory = probe
    service.api_key = None
    service.managed_identity_client_id = "configured-identity"
    service.azure_endpoint = "https://configured.openai.azure.com/openai/v1/"
    credential = AsyncMock()
    credential.__aenter__.return_value = credential
    credential_factory = Mock(return_value=credential)
    token_provider = AsyncMock(return_value="bearer-secret")
    get_provider = Mock(return_value=token_provider)
    monkeypatch.setattr(module, "DefaultAzureCredential", credential_factory)
    monkeypatch.setattr(module, "get_bearer_token_provider", get_provider)

    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )

    assert result.status == "success"
    credential_factory.assert_called_once_with(
        managed_identity_client_id="configured-identity"
    )
    get_provider.assert_called_once_with(credential, "https://ai.azure.com/.default")
    assert factory.call_args.kwargs["api_key"] is token_provider
    assert factory.call_args.kwargs["base_url"] == (
        "https://configured.openai.azure.com/openai/v1"
    )
    credential.__aexit__.assert_awaited_once()
    client.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status_code, expected",
    [
        (400, "selected request format"),
        (401, "authentication failed"),
        (403, "authentication failed"),
        (404, "not found"),
        (429, "rate limited"),
        (500, "Try again later"),
    ],
)
async def test_provider_failures_return_safe_actionable_messages(
    probe, status_code, expected
):
    service, client, _ = probe
    request = httpx.Request("POST", "https://private-endpoint.example/openai/v1/responses")
    client.responses.create.side_effect = APIStatusError(
        "private diagnostic server-secret",
        response=httpx.Response(status_code, request=request),
        body={"secret": "server-secret"},
    )

    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )

    assert result.status == "error"
    assert expected in result.message
    assert "secret" not in result.message
    assert "private" not in result.message


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["timeout", "connection", "unexpected"])
async def test_transport_and_unexpected_failures_do_not_expose_exceptions(
    probe, failure
):
    service, client, _ = probe
    request = httpx.Request("POST", "https://private-endpoint.example")
    failures = {
        "timeout": APITimeoutError(request=request),
        "connection": APIConnectionError(request=request, message="server-secret"),
        "unexpected": RuntimeError("server-secret"),
    }
    client.responses.create.side_effect = failures[failure]
    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )
    assert result.status == "error"
    assert "secret" not in result.message
    assert "private" not in result.message
    client.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
async def test_overall_deadline_cancels_an_unresponsive_probe(probe, monkeypatch):
    service, client, _ = probe
    cancelled = False

    async def unresponsive(**kwargs):
        nonlocal cancelled
        try:
            await asyncio.Event().wait()
        finally:
            cancelled = True

    monkeypatch.setattr(module, "PROBE_TIMEOUT_SECONDS", 0.01)
    client.responses.create.side_effect = unresponsive
    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )
    assert result.status == "error"
    assert "timed out" in result.message
    assert cancelled
    client.__aexit__.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status, expected", [("incomplete", "success"), ("failed", "error")]
)
async def test_token_limit_confirms_connectivity_but_provider_failure_does_not(
    probe, status, expected
):
    service, client, _ = probe
    client.responses.create.return_value = SimpleNamespace(status=status)
    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )
    assert result.status == expected


@pytest.mark.asyncio
async def test_missing_endpoint_does_not_create_a_client(probe):
    service, _, factory = probe
    service.azure_endpoint = ""
    result = await service.test_connection(
        ModelConnectionRequest(deployment="deployment-blue", provider="responses")
    )
    assert result.status == "error"
    factory.assert_not_called()
