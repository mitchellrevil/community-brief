from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.jobs import JobRepository


async def _async_items(items):
    for item in items:
        yield item


@pytest.fixture
def jobs_container():
    container = MagicMock()
    container.read = AsyncMock(return_value={"defaultTtl": 2_592_000})
    container.read_item = AsyncMock()
    container.create_item = AsyncMock()
    container.replace_item = AsyncMock()
    container.delete_item = AsyncMock()
    return container


@pytest.fixture
def cosmos_service(jobs_container):
    service = MagicMock()
    service.get_container.return_value = jobs_container
    return service


@pytest.fixture
def repository(cosmos_service):
    return JobRepository(cosmos_service)


@pytest.mark.asyncio
async def test_get_by_id_returns_job(repository, jobs_container):
    jobs_container.read_item.return_value = {"id": "job-1", "type": "job", "_ts": 100}

    result = await repository.get_by_id("job-1")

    assert result == {"id": "job-1", "type": "job", "_ts": 100, "ttl": 2_592_000}
    jobs_container.read_item.assert_called_once_with(item="job-1", partition_key="job-1")


@pytest.mark.asyncio
async def test_get_by_id_preserves_item_ttl_override(repository, jobs_container):
    jobs_container.read_item.return_value = {
        "id": "job-1",
        "type": "job",
        "_ts": 100,
        "ttl": 3600,
    }

    result = await repository.get_by_id("job-1")

    assert result["ttl"] == 3600
    jobs_container.read.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_by_id_returns_none_for_non_job(repository, jobs_container):
    jobs_container.read_item.return_value = {"id": "user-1", "type": "user"}

    assert await repository.get_by_id("user-1") is None


@pytest.mark.asyncio
async def test_get_by_id_returns_none_when_missing(repository, jobs_container):
    jobs_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.get_by_id("missing") is None


@pytest.mark.asyncio
async def test_query_returns_items(repository, jobs_container):
    items = [
        {"id": "job-1", "type": "job", "_ts": 100},
        {"id": "job-2", "type": "job", "_ts": 200},
    ]
    jobs_container.query_items.return_value = _async_items(items)

    result = await repository.query("SELECT * FROM c", [{"name": "@type", "value": "job"}])

    assert [item["ttl"] for item in result] == [2_592_000, 2_592_000]
    jobs_container.read.assert_awaited_once()
    jobs_container.query_items.assert_called_once_with(
        query="SELECT * FROM c",
        parameters=[{"name": "@type", "value": "job"}],
    )


@pytest.mark.asyncio
async def test_create_uses_jobs_container(repository, jobs_container):
    created_at = datetime.now(UTC)
    job_doc = {"id": "job-1", "type": "job", "created_at": created_at.isoformat()}
    jobs_container.create_item.return_value = job_doc

    assert await repository.create(job_doc) == job_doc
    jobs_container.create_item.assert_called_once_with(body=job_doc)
    assert datetime.fromisoformat(job_doc["expires_at"]) == created_at + timedelta(days=30)
    assert 30 * 86_400 - 2 <= job_doc["ttl"] <= 30 * 86_400


@pytest.mark.asyncio
async def test_replace_uses_jobs_container(repository, jobs_container):
    expires_at = datetime.now(UTC) + timedelta(days=12)
    job_doc = {
        "id": "job-1",
        "type": "job",
        "status": "completed",
        "expires_at": expires_at.isoformat(),
    }
    jobs_container.replace_item.return_value = job_doc

    assert await repository.replace("job-1", job_doc) == job_doc
    jobs_container.replace_item.assert_called_once_with(item="job-1", body=job_doc)
    assert 12 * 86_400 - 2 <= job_doc["ttl"] <= 12 * 86_400


@pytest.mark.asyncio
async def test_replace_expires_legacy_job_from_original_creation_time(repository, jobs_container):
    job_doc = {
        "id": "job-1",
        "type": "job",
        "created_at": (datetime.now(UTC) - timedelta(days=31)).isoformat(),
    }
    jobs_container.replace_item.return_value = job_doc

    await repository.replace("job-1", job_doc)

    assert job_doc["ttl"] == 1
    assert datetime.fromisoformat(job_doc["expires_at"]) < datetime.now(UTC)


@pytest.mark.asyncio
async def test_delete_uses_jobs_container(repository, jobs_container):
    assert await repository.delete("job-1") is True
    jobs_container.delete_item.assert_called_once_with(item="job-1", partition_key="job-1")


@pytest.mark.asyncio
async def test_delete_returns_false_when_missing(repository, jobs_container):
    jobs_container.delete_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.delete("missing") is False
