from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import Response
from starlette.requests import Request


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/stream/jobs/job-1/status",
            "headers": [],
        }
    )


@pytest.mark.asyncio
async def test_stream_job_status_delegates_to_stream_service():
    from app.api.v1.routes.streaming import stream_job_status

    response = Response(status_code=200)
    stream_service = MagicMock()
    stream_service.open_job_status_stream = AsyncMock(return_value=response)
    request = make_request()
    current_user = {"id": "user-1"}

    result = await stream_job_status(
        job_id="job-1",
        request=request,
        current_user=current_user,
        stream_service=stream_service,
    )

    assert result is response
    stream_service.open_job_status_stream.assert_awaited_once_with(
        job_id="job-1",
        request=request,
        current_user=current_user,
    )


@pytest.mark.asyncio
async def test_options_job_status_stream_delegates_to_stream_service():
    from app.api.v1.routes.streaming import options_job_status_stream

    response = Response(status_code=200)
    stream_service = MagicMock()
    stream_service.build_options_response.return_value = response

    result = await options_job_status_stream(
        job_id="job-1",
        stream_service=stream_service,
    )

    assert result is response
    stream_service.build_options_response.assert_called_once_with()
