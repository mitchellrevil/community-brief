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
    jobs_container.read_item.return_value = {"id": "job-1", "type": "job"}

    result = await repository.get_by_id("job-1")

    assert result == {"id": "job-1", "type": "job"}
    jobs_container.read_item.assert_called_once_with(item="job-1", partition_key="job-1")


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
    items = [{"id": "job-1"}, {"id": "job-2"}]
    jobs_container.query_items.return_value = _async_items(items)

    result = await repository.query("SELECT * FROM c", [{"name": "@type", "value": "job"}])

    assert result == items
    jobs_container.query_items.assert_called_once_with(
        query="SELECT * FROM c",
        parameters=[{"name": "@type", "value": "job"}],
    )


@pytest.mark.asyncio
async def test_create_uses_jobs_container(repository, jobs_container):
    job_doc = {"id": "job-1", "type": "job"}
    jobs_container.create_item.return_value = job_doc

    assert await repository.create(job_doc) == job_doc
    jobs_container.create_item.assert_called_once_with(body=job_doc)


@pytest.mark.asyncio
async def test_replace_uses_jobs_container(repository, jobs_container):
    job_doc = {"id": "job-1", "type": "job", "status": "completed"}
    jobs_container.replace_item.return_value = job_doc

    assert await repository.replace("job-1", job_doc) == job_doc
    jobs_container.replace_item.assert_called_once_with(item="job-1", body=job_doc)


@pytest.mark.asyncio
async def test_delete_uses_jobs_container(repository, jobs_container):
    assert await repository.delete("job-1") is True
    jobs_container.delete_item.assert_called_once_with(item="job-1", partition_key="job-1")


@pytest.mark.asyncio
async def test_delete_returns_false_when_missing(repository, jobs_container):
    jobs_container.delete_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.delete("missing") is False
