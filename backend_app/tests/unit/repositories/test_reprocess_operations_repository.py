from copy import deepcopy

import pytest
from azure.cosmos.exceptions import (
    CosmosHttpResponseError,
    CosmosResourceNotFoundError,
)

from app.repositories.reprocess_operations import ReprocessOperationRepository


class InMemoryAsyncContainer:
    def __init__(self) -> None:
        self.items: dict[str, dict] = {}
        self.etag = 0

    async def create_item(self, *, body: dict) -> dict:
        item_id = body["id"]
        if item_id in self.items:
            raise CosmosHttpResponseError(status_code=409, message="Conflict")
        return self._save(body)

    async def read_item(self, *, item: str, partition_key: str) -> dict:
        assert item == partition_key
        if item not in self.items:
            raise CosmosResourceNotFoundError(status_code=404, message="Not found")
        return deepcopy(self.items[item])

    async def replace_item(self, *, item: str, body: dict, **_options) -> dict:
        return self._save({**body, "id": item})

    async def delete_item(self, *, item: str, partition_key: str, **_options) -> None:
        assert item == partition_key
        if item not in self.items:
            raise CosmosResourceNotFoundError(status_code=404, message="Not found")
        del self.items[item]

    def _save(self, body: dict) -> dict:
        self.etag += 1
        saved = deepcopy(body)
        saved["_etag"] = f"etag-{self.etag}"
        self.items[saved["id"]] = saved
        return deepcopy(saved)


class FakeCosmosService:
    def __init__(self, container: InMemoryAsyncContainer) -> None:
        self.container = container

    def get_container(self, name: str) -> InMemoryAsyncContainer:
        assert name == "jobs"
        return self.container


def operation(operation_id: str, *, status: str = "pending_enqueue") -> dict:
    return {
        "id": operation_id,
        "type": "reprocess_operation",
        "job_id": "job-1",
        "status": status,
    }


def repository():
    container = InMemoryAsyncContainer()
    return ReprocessOperationRepository(FakeCosmosService(container)), container


@pytest.mark.asyncio
async def test_create_reserves_one_active_operation_per_job():
    operations, _ = repository()

    first, first_created = await operations.create_with_lock(operation("operation-1"))
    concurrent, concurrent_created = await operations.create_with_lock(
        operation("operation-2")
    )

    assert first_created is True
    assert first["id"] == "operation-1"
    assert concurrent_created is False
    assert concurrent["id"] == "operation-1"


@pytest.mark.asyncio
async def test_terminal_operation_lock_is_replaced_by_the_next_request():
    operations, _ = repository()
    await operations.create_with_lock(operation("operation-1"))
    await operations.update("operation-1", {"status": "failed"})

    second, second_created = await operations.create_with_lock(operation("operation-2"))

    assert second_created is True
    assert second["id"] == "operation-2"


@pytest.mark.asyncio
async def test_releasing_a_lock_only_removes_the_matching_operation_lock():
    operations, container = repository()
    await operations.create_with_lock(operation("operation-1"))

    await operations.release_lock("job-1", "another-operation")
    assert "reprocess-lock:job-1" in container.items

    await operations.release_lock("job-1", "operation-1")
    assert "reprocess-lock:job-1" not in container.items
