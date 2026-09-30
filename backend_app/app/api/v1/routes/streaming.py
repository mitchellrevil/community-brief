from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response, StreamingResponse

from ....core.auth import get_current_user_sse
from ....core.rate_limit import expensive_operation_limit, standard_rate_limit
from ....deps import get_job_status_stream_service
from ....services.jobs.job_status_stream_service import JobStatusStreamService


router = APIRouter(prefix="/stream", tags=["streaming"], dependencies=[Depends(standard_rate_limit)])


@router.options("/jobs/{job_id}/status")
async def options_job_status_stream(
    job_id: str,
    stream_service: JobStatusStreamService = Depends(get_job_status_stream_service),
) -> Response:
    return stream_service.build_options_response()


@router.get("/jobs/{job_id}/status", dependencies=[Depends(expensive_operation_limit)])
async def stream_job_status(
    job_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user_sse),
    stream_service: JobStatusStreamService = Depends(get_job_status_stream_service),
) -> StreamingResponse:
    return await stream_service.open_job_status_stream(
        job_id=job_id,
        request=request,
        current_user=current_user,
    )
