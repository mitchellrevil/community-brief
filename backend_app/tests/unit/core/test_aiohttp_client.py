import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from backend_app.app.core.aiohttp_client import get_aiohttp_session, startup, shutdown, _get_cached_session

@pytest.mark.asyncio
async def test_get_aiohttp_session():
    session = get_aiohttp_session()
    assert session is not None
    assert not session.closed

@pytest.mark.asyncio
async def test_startup():
    session = await startup()
    assert session is not None
    assert not session.closed

@pytest.mark.asyncio
async def test_shutdown():
    # Ensure session is created
    await startup()
    
    # Mock the session object returned by _get_cached_session
    # We need to patch _get_cached_session to return a mock that we can verify close() on
    # But _get_cached_session is lru_cached, so we need to clear cache first
    _get_cached_session.cache_clear()
    
    with patch("backend_app.app.core.aiohttp_client.aiohttp.ClientSession") as MockSession:
        mock_session_instance = MockSession.return_value
        mock_session_instance.close = AsyncMock()
        mock_session_instance.closed = False # Initial state
        
        # Call startup to populate cache with our mock
        await startup()
        
        # Call shutdown
        await shutdown()
        
        # Verify close was called
        mock_session_instance.close.assert_called_once()
        
        # Verify cache is cleared (calling get_aiohttp_session again should create new session)
        # Since we mocked ClientSession, a new mock will be created
        assert _get_cached_session.cache_info().currsize == 0

@pytest.mark.asyncio
async def test_session_recreation_if_closed():
    _get_cached_session.cache_clear()
    session1 = get_aiohttp_session()
    
    # Close the session
    await session1.close()
    
    # Verify it is closed
    assert session1.closed
    
    # Get session again, should be a new one
    session2 = get_aiohttp_session()
    assert session1 is not session2
    assert not session2.closed
    
    await session2.close()

