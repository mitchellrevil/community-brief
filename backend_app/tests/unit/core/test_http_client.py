import pytest

import app.core.http_client as http_client


@pytest.mark.asyncio
async def test_httpx_startup_shutdown_cycle():
    # Ensure a clean state
    await http_client.shutdown()

    # Before startup, get_http_client should raise
    with pytest.raises(RuntimeError):
        http_client.get_http_client()

    # Start the client and validate
    await http_client.startup(timeout=0.5)
    client = http_client.get_http_client()
    assert client is not None
    # Ensure it's an httpx client
    import httpx
    assert isinstance(client, httpx.AsyncClient)

    # Shutdown and ensure get_http_client raises again
    await http_client.shutdown()
    with pytest.raises(RuntimeError):
        http_client.get_http_client()
