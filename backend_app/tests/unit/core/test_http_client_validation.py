import pytest
import asyncio

import app.core.http_client as http_client

class DummyResponse:
    def __init__(self, status_code):
        self.status_code = status_code

class DummyClient:
    def __init__(self, status_code=200):
        self._status = status_code

    async def options(self, url, headers=None, timeout=None):
        return DummyResponse(self._status)

@pytest.mark.asyncio
async def test_validate_azure_success():
    client = DummyClient(status_code=200)
    await http_client.validate_azure_functions_auth(client, "http://example.local", "fakekey")

@pytest.mark.asyncio
async def test_validate_azure_unauthorized():
    client = DummyClient(status_code=401)
    with pytest.raises(RuntimeError) as exc:
        await http_client.validate_azure_functions_auth(client, "http://example.local", "fakekey")
    assert "401" in str(exc.value)

@pytest.mark.asyncio
async def test_validate_azure_unreachable():
    class BadClient:
        async def options(self, *a, **k):
            raise http_client.httpx.HTTPError("boom")

    client = BadClient()
    with pytest.raises(RuntimeError):
        await http_client.validate_azure_functions_auth(client, "http://example.local", "fakekey")
