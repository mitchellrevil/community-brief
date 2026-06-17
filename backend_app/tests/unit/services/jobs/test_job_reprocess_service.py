import uuid
from unittest.mock import MagicMock

import httpx
import pytest

from app.services.jobs.job_reprocess_service import JobReprocessService


class FakeResponse:
    def __init__(self, *, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {"status": "success", "message": "Analysis reprocessed"}
        self.text = text
        self.request = httpx.Request("POST", "https://func.example.com/api/reprocess-analysis")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=self.request, response=self)

    def json(self):
        return self._payload


class CapturingClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return self.response


def build_service(client):
    config = MagicMock()
    config.azure_functions_base_url = "https://func.example.com/"
    return JobReprocessService(
        config,
        http_client_factory=lambda: client,
        auth_headers_factory=lambda base_url: {"Authorization": f"Bearer for {base_url}"},
        timeout_seconds=3.5,
    )


@pytest.mark.asyncio
async def test_reprocess_job_analysis_calls_function_with_enriched_payload_and_correlation_id():
    client = CapturingClient(FakeResponse(payload={"status": "success", "attempt_number": 2}))
    service = build_service(client)

    result = await service.reprocess_job_analysis(
        job_id="job-1",
        request_payload={"instructions": "Try again"},
        job={"id": "job-1", "displayname": "Board sync"},
        current_user={"id": "user-1", "email": "user@example.com"},
    )

    assert result.status_code == 200
    assert result.payload["attempt_number"] == 2
    call = client.calls[0]
    assert call["url"] == "https://func.example.com/api/reprocess-analysis"
    assert call["timeout"] == 3.5
    assert call["json"] == {
        "instructions": "Try again",
        "job_id": "job-1",
        "user_id": "user-1",
        "user_email": "user@example.com",
        "displayname": "Board sync",
    }
    assert call["headers"]["Authorization"] == "Bearer for https://func.example.com"
    uuid.UUID(call["headers"]["x-correlation-id"])


@pytest.mark.asyncio
async def test_reprocess_job_analysis_returns_202_on_function_read_timeout():
    class TimeoutClient:
        async def post(self, url, json=None, headers=None, timeout=None):
            raise httpx.ReadTimeout("timeout", request=httpx.Request("POST", url))

    service = build_service(TimeoutClient())

    result = await service.reprocess_job_analysis(
        job_id="job-2",
        request_payload={},
        job={"id": "job-2"},
        current_user={"id": "user-1"},
    )

    assert result.status_code == 202
    assert result.payload["status"] == "accepted"
    assert result.payload["job_id"] == "job-2"


@pytest.mark.asyncio
async def test_reprocess_job_analysis_maps_function_401_to_502_payload():
    service = build_service(CapturingClient(FakeResponse(status_code=401, text="not allowed")))

    result = await service.reprocess_job_analysis(
        job_id="job-3",
        request_payload={},
        job={"id": "job-3"},
        current_user={"id": "user-1"},
    )

    assert result.status_code == 502
    assert result.payload["status"] == "error"
    assert result.payload["details"] == {"azure_status_code": 401}
