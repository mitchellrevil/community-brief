import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.services.monitoring.session_persistence import CosmosSessionPersistence


class DummyContainer:
    def __init__(self):
        self.deleted = None

    async def read_item(self, item, partition_key):
        return {"id": item, "user_id": "user-abc", "partition_key": "user-abc"}

    async def delete_item(self, item, partition_key):
        self.deleted = (item, partition_key)

    async def query_items(self, query, parameters, enable_cross_partition_query=False):
        async def gen():
            yield {"id": parameters[0]["value"], "user_id": "user-xyz"}
        return gen()


class FailReadContainer(DummyContainer):
    async def read_item(self, item, partition_key):
        raise CosmosResourceNotFoundError(message="read failed")


class RuntimeFailReadContainer(DummyContainer):
    async def read_item(self, item, partition_key):
        raise RuntimeError("read failed")


@pytest.mark.asyncio
async def test_delete_session_uses_user_partition_key():
    c = DummyContainer()
    p = CosmosSessionPersistence(c)
    await p.delete_session("sess-1")
    assert c.deleted == ("sess-1", "user-abc")


@pytest.mark.asyncio
async def test_delete_session_fallback_query():
    c = FailReadContainer()
    p = CosmosSessionPersistence(c)
    await p.delete_session("sess-2")
    assert c.deleted == ("sess-2", "user-xyz")


@pytest.mark.asyncio
async def test_get_session_propagates_unexpected_read_failure():
    p = CosmosSessionPersistence(RuntimeFailReadContainer())

    with pytest.raises(RuntimeError, match="read failed"):
        await p.get_session("sess-3")

