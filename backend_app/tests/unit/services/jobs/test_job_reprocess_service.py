from __future__ import annotations

from copy import deepcopy

import pytest

from app.core.errors.domain import ApplicationError
from app.services.jobs.job_reprocess_service import JobReprocessService
from app.services.jobs.reprocess_queue import ReprocessQueueError


class FakeOperationRepository:
    def __init__(self) -> None:
        self.operations: dict[str, dict] = {}
        self.active_operation: dict | None = None
        self.released_locks: list[tuple[str, str]] = []
        self.fail_updates = False
        self.fail_lock_release = False

    async def create_with_lock(self, operation: dict) -> tuple[dict, bool]:
        existing = self.operations.get(operation["id"])
        if existing is not None:
            return deepcopy(existing), False
        if self.active_operation is not None:
            return deepcopy(self.active_operation), False
        self.operations[operation["id"]] = deepcopy(operation)
        return deepcopy(operation), True

    async def get(self, operation_id: str) -> dict | None:
        operation = self.operations.get(operation_id)
        return deepcopy(operation) if operation else None

    async def update(self, operation_id: str, updates: dict) -> dict:
        if self.fail_updates:
            raise RuntimeError("Cosmos unavailable")
        self.operations[operation_id].update(updates)
        return deepcopy(self.operations[operation_id])

    async def release_lock(self, job_id: str, operation_id: str) -> None:
        if self.fail_lock_release:
            raise RuntimeError("Cosmos unavailable")
        self.released_locks.append((job_id, operation_id))


class CapturingPublisher:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.commands: list[dict] = []
        self.error = error

    async def publish(self, command: dict) -> None:
        if self.error:
            raise self.error
        self.commands.append(deepcopy(command))


def build_service(
    repository: FakeOperationRepository | None = None,
    publisher: CapturingPublisher | None = None,
) -> tuple[JobReprocessService, FakeOperationRepository, CapturingPublisher]:
    repository = repository or FakeOperationRepository()
    publisher = publisher or CapturingPublisher()
    return JobReprocessService(repository, publisher), repository, publisher


async def submit(service: JobReprocessService, *, idempotency_key: str = "request-1"):
    return await service.reprocess_job_analysis(
        job_id="job-1",
        request_payload={"instructions": "Try again"},
        job={"id": "job-1", "displayname": "Board sync"},
        current_user={"id": "user-1", "email": "user@example.com"},
        idempotency_key=idempotency_key,
    )


@pytest.mark.asyncio
async def test_submit_persists_and_publishes_a_durable_command():
    service, repository, publisher = build_service()

    result = await submit(service)

    assert result.status_code == 202
    assert result.payload["status"] == "queued"
    operation_id = result.payload["operation_id"]
    assert repository.operations[operation_id]["status"] == "queued"
    assert publisher.commands == [
        {
            "instructions": "Try again",
            "job_id": "job-1",
            "user_id": "user-1",
            "user_email": "user@example.com",
            "displayname": "Board sync",
            "operation_id": operation_id,
            "correlation_id": operation_id,
        }
    ]


@pytest.mark.asyncio
async def test_same_idempotency_key_returns_the_existing_queued_operation():
    service, _, publisher = build_service()

    first = await submit(service)
    second = await submit(service)

    assert second.payload["operation_id"] == first.payload["operation_id"]
    assert len(publisher.commands) == 1


@pytest.mark.asyncio
async def test_pending_enqueue_operation_is_published_again_after_interrupted_submission():
    service, repository, publisher = build_service()
    operation_id = service._operation_id(
        job_id="job-1",
        user_id="user-1",
        idempotency_key="request-1",
    )
    repository.operations[operation_id] = {
        "id": operation_id,
        "type": "reprocess_operation",
        "job_id": "job-1",
        "status": "pending_enqueue",
        "request": {"job_id": "job-1", "user_id": "user-1"},
    }

    result = await submit(service)

    assert result.payload["status"] == "queued"
    assert publisher.commands[0]["operation_id"] == operation_id


@pytest.mark.asyncio
async def test_active_operation_prevents_concurrent_reprocessing_for_the_same_job():
    repository = FakeOperationRepository()
    repository.active_operation = {
        "id": "already-running",
        "type": "reprocess_operation",
        "job_id": "job-1",
        "status": "running",
    }
    service, _, publisher = build_service(repository=repository)

    result = await submit(service)

    assert result.payload["operation_id"] == "already-running"
    assert publisher.commands == []


@pytest.mark.asyncio
async def test_queue_failure_is_reported_and_releases_the_job_lock():
    publisher = CapturingPublisher(error=ReprocessQueueError("queue unavailable"))
    service, repository, _ = build_service(publisher=publisher)

    with pytest.raises(ApplicationError) as error:
        await submit(service)

    assert error.value.status_code == 503
    operation = next(iter(repository.operations.values()))
    assert operation["status"] == "enqueue_failed"
    assert repository.released_locks == [("job-1", operation["id"])]


@pytest.mark.asyncio
async def test_successful_queue_send_remains_accepted_when_status_update_is_interrupted():
    service, repository, publisher = build_service()
    repository.fail_updates = True

    result = await submit(service)

    assert result.status_code == 202
    assert result.payload["status"] == "queued"
    assert len(publisher.commands) == 1


@pytest.mark.asyncio
async def test_lock_cleanup_failure_does_not_hide_the_queue_failure():
    publisher = CapturingPublisher(error=ReprocessQueueError("queue unavailable"))
    repository = FakeOperationRepository()
    repository.fail_lock_release = True
    service, _, _ = build_service(repository=repository, publisher=publisher)

    with pytest.raises(ApplicationError) as error:
        await submit(service)

    assert error.value.status_code == 503
    assert error.value.__cause__ is publisher.error
