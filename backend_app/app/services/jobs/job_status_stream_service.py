from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any, AsyncIterator, Dict

from fastapi import Request
from fastapi.responses import Response, StreamingResponse

from ...core.config import AppConfig
from ...core.errors.domain import PermissionError, ResourceNotFoundError
from ...core.logging import get_logger
from .job_permissions import check_job_access
from .job_service import JobService


logger = get_logger(__name__)

JOB_STATUS_STREAM_ERRORS = (RuntimeError, OSError, ValueError, TypeError)


class JobStatusStreamService:
    def __init__(
        self,
        job_service: JobService,
        config: AppConfig,
        *,
        poll_interval_seconds: float = 1.0,
        max_polls: int = 1800,
    ) -> None:
        self._job_service = job_service
        self._config = config
        self._poll_interval_seconds = poll_interval_seconds
        self._max_polls = max_polls

    def build_options_response(self) -> Response:
        allowed_origins = self._config.cors_origins_list
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": allowed_origins[0] if allowed_origins else "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": (
                    "Authorization, Content-Type, Accept, X-Requested-With, Cache-Control, "
                    "Connection, X-Accel-Buffering"
                ),
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "86400",
            },
        )

    async def open_job_status_stream(
        self,
        *,
        job_id: str,
        request: Request,
        current_user: Dict[str, Any],
    ) -> StreamingResponse:
        job = await self._job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)

        logger.debug(
            "job_status_stream_access_check",
            job_id=job_id,
            job_owner=job.get("user_id"),
            current_user_id=current_user.get("id") if isinstance(current_user, dict) else str(current_user),
        )

        if not check_job_access(job, current_user, "view"):
            raise PermissionError("Access denied to job")

        return StreamingResponse(
            self._generate_status_events(job_id=job_id, current_user=current_user),
            media_type="text/event-stream",
            headers=self._stream_headers(request),
        )

    async def _generate_status_events(
        self,
        *,
        job_id: str,
        current_user: Dict[str, Any],
    ) -> AsyncIterator[str]:
        last_status = None
        terminal_states = {"completed", "failed"}

        for _ in range(self._max_polls):
            try:
                current_job = await self._job_service.get_job(job_id)
                if not current_job:
                    yield self._format_event({"error": "Job not found", "status": "error"})
                    break

                current_status = current_job.get("status", "unknown")
                if last_status is None or current_status != last_status:
                    await self._job_service.enrich_job_file_urls(current_job)

                    yield self._format_event(
                        {
                            "status": current_status,
                            "job": current_job,
                            "timestamp": datetime.now(UTC).isoformat(),
                        }
                    )
                    last_status = current_status

                    logger.debug(
                        "job_status_stream_status_emitted",
                        job_id=job_id,
                        status=current_status,
                        user_id=current_user.get("id") if isinstance(current_user, dict) else current_user,
                    )

                    if current_status in terminal_states:
                        logger.info(
                            "job_status_stream_terminal_state_reached",
                            job_id=job_id,
                            final_status=current_status,
                        )
                        break

                await asyncio.sleep(self._poll_interval_seconds)
            except JOB_STATUS_STREAM_ERRORS as exc:
                logger.error(
                    "job_status_stream_generator_failed",
                    exc_info=True,
                    job_id=job_id,
                    error_type=type(exc).__name__,
                )
                yield self._format_event({"error": str(exc), "status": "error"})
                break

    def _stream_headers(self, request: Request) -> Dict[str, str]:
        allowed_origins = self._config.cors_origins_list
        origin_header = allowed_origins[0] if allowed_origins else request.headers.get("origin", "*")
        return {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": origin_header,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": (
                "Authorization, Content-Type, Accept, X-Requested-With, Cache-Control, "
                "Connection, X-Accel-Buffering"
            ),
            "Access-Control-Expose-Headers": (
                "Cache-Control, Connection, X-Accel-Buffering, Transfer-Encoding, Content-Type"
            ),
        }

    @staticmethod
    def _format_event(data: Dict[str, Any]) -> str:
        return f"data: {json.dumps(data)}\n\n"
