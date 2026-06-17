import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request

from app.core.errors.domain import PermissionError, ResourceNotFoundError
from app.services.jobs.job_status_stream_service import JobStatusStreamService


def make_request(origin: str = "https://frontend.example") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/stream/jobs/job-1/status",
            "headers": [(b"origin", origin.encode())],
        }
    )


def make_service(job_service, origins=None) -> JobStatusStreamService:
    config = SimpleNamespace(cors_origins_list=origins or ["https://app.example"])
    return JobStatusStreamService(
        job_service=job_service,
        config=config,
        poll_interval_seconds=0,
        max_polls=2,
    )


@pytest.mark.asyncio
async def test_open_job_status_stream_raises_not_found_when_job_missing():
    job_service = AsyncMock()
    job_service.get_job.return_value = None
    service = make_service(job_service)

    with pytest.raises(ResourceNotFoundError):
        await service.open_job_status_stream(
            job_id="missing",
            request=make_request(),
            current_user={"id": "user-1"},
        )


@pytest.mark.asyncio
async def test_open_job_status_stream_raises_permission_error_without_access():
    job_service = AsyncMock()
    job_service.get_job.return_value = {"id": "job-1", "user_id": "owner-1", "status": "uploaded"}
    service = make_service(job_service)

    with pytest.raises(PermissionError):
        await service.open_job_status_stream(
            job_id="job-1",
            request=make_request(),
            current_user={"id": "user-1", "permission": "User"},
        )


@pytest.mark.asyncio
async def test_open_job_status_stream_emits_terminal_status_event():
    job = {"id": "job-1", "user_id": "user-1", "status": "completed"}
    job_service = AsyncMock()
    job_service.get_job.side_effect = [job, dict(job)]
    job_service.enrich_job_file_urls = AsyncMock()
    service = make_service(job_service)

    response = await service.open_job_status_stream(
        job_id="job-1",
        request=make_request(),
        current_user={"id": "user-1", "permission": "User"},
    )

    event = await anext(response.body_iterator)
    payload = json.loads(event.removeprefix("data: ").strip())

    assert response.media_type == "text/event-stream"
    assert response.headers["access-control-allow-origin"] == "https://app.example"
    assert payload["status"] == "completed"
    assert payload["job"]["id"] == "job-1"
    job_service.enrich_job_file_urls.assert_awaited_once()


@pytest.mark.asyncio
async def test_status_stream_emits_error_event_when_polling_fails():
    job = {"id": "job-1", "user_id": "user-1", "status": "uploaded"}
    job_service = AsyncMock()
    job_service.get_job.side_effect = [job, RuntimeError("poll failed")]
    job_service.enrich_job_file_urls = AsyncMock()
    service = make_service(job_service)

    response = await service.open_job_status_stream(
        job_id="job-1",
        request=make_request(),
        current_user={"id": "user-1", "permission": "User"},
    )

    event = await anext(response.body_iterator)
    payload = json.loads(event.removeprefix("data: ").strip())

    assert payload == {"error": "poll failed", "status": "error"}


def test_build_options_response_uses_configured_origin():
    job_service = AsyncMock()
    service = make_service(job_service, origins=["https://allowed.example"])

    response = service.build_options_response()

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://allowed.example"
    assert response.headers["access-control-allow-methods"] == "GET, OPTIONS"
