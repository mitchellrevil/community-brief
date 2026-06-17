from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors.domain import ResourceNotFoundError
from app.repositories.jobs import JobRepository
from app.services.jobs.job_chat_history_service import JobChatHistoryService


@pytest.fixture
def job_repository():
    repository = MagicMock(spec=JobRepository)
    repository.get_by_id = AsyncMock()
    repository.replace = AsyncMock()
    return repository


@pytest.fixture
def service(job_repository):
    return JobChatHistoryService(job_repository)


@pytest.mark.asyncio
async def test_save_message_initializes_history(service, job_repository):
    job = {"id": "job-1", "type": "job"}
    job_repository.get_by_id.return_value = job

    length = await service.save_message("job-1", role="user", content="hello")

    assert length == 1
    assert job["chat_history"][0]["role"] == "user"
    assert job["chat_history"][0]["content"] == "hello"
    assert "timestamp" in job["chat_history"][0]
    job_repository.replace.assert_awaited_once_with("job-1", job)


@pytest.mark.asyncio
async def test_get_history_returns_existing_history(service, job_repository):
    history = [{"role": "assistant", "content": "summary"}]
    job_repository.get_by_id.return_value = {"id": "job-1", "type": "job", "chat_history": history}

    assert await service.get_history("job-1") == history


@pytest.mark.asyncio
async def test_clear_history_removes_history_and_response_id(service, job_repository):
    job = {
        "id": "job-1",
        "type": "job",
        "chat_history": [{"role": "user", "content": "hello"}],
        "chat_response_id": "resp-1",
    }
    job_repository.get_by_id.return_value = job

    await service.clear_history("job-1")

    assert job["chat_history"] == []
    assert "chat_response_id" not in job
    job_repository.replace.assert_awaited_once_with("job-1", job)


@pytest.mark.asyncio
async def test_store_response_id_updates_job(service, job_repository):
    job = {"id": "job-1", "type": "job"}
    job_repository.get_by_id.return_value = job

    await service.store_response_id("job-1", "resp-1")

    assert job["chat_response_id"] == "resp-1"
    job_repository.replace.assert_awaited_once_with("job-1", job)


@pytest.mark.asyncio
async def test_get_job_raises_when_missing(service, job_repository):
    job_repository.get_by_id.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await service.get_job("missing")
