from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.sessions import SessionRepository


def _async_items(items):
    async def iterator():
        for item in items:
            yield item

    return iterator()


@pytest.mark.asyncio
async def test_get_session_falls_back_to_cross_partition_lookup():
    container = MagicMock()
    container.read_item = AsyncMock(side_effect=CosmosResourceNotFoundError(message="wrong partition"))
    container.query_items.return_value = _async_items([{"id": "session-1", "user_id": "user-1"}])

    result = await SessionRepository(container).get_session("session-1")

    assert result == {"id": "session-1", "user_id": "user-1"}
    container.query_items.assert_called_once_with(
        query="SELECT * FROM c WHERE c.id = @id",
        parameters=[{"name": "@id", "value": "session-1"}],
        enable_cross_partition_query=True,
    )


@pytest.mark.asyncio
async def test_get_session_propagates_unexpected_read_errors():
    container = MagicMock()
    container.read_item = AsyncMock(side_effect=RuntimeError("storage failed"))

    with pytest.raises(RuntimeError, match="storage failed"):
        await SessionRepository(container).get_session("session-1")

    container.query_items.assert_not_called()


@pytest.mark.asyncio
async def test_find_active_sessions_before_collects_stale_sessions():
    container = MagicMock()
    stale_session = {"id": "session-1", "status": "active"}
    container.query_items.return_value = _async_items([stale_session])

    result = await SessionRepository(container).find_active_sessions_before("2024-01-01T00:00:00+00:00")

    assert result == [stale_session]
    call_kwargs = container.query_items.call_args.kwargs
    assert "last_heartbeat < @stale_time" in call_kwargs["query"]
    assert call_kwargs["parameters"] == [{"name": "@stale_time", "value": "2024-01-01T00:00:00+00:00"}]
    assert call_kwargs["enable_cross_partition_query"] is True
