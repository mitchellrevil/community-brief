"""HTTP-adjacent job analysis workflows owned outside the route module."""
from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse, StreamingResponse

from ...core.errors.domain import PermissionError, ResourceNotFoundError
from ...schemas.job_analysis import ChatMessage, ReprocessRequest
from .job_analysis_chat_service import JobAnalysisChatService
from .job_chat_history_service import JobChatHistoryService
from .job_permissions import check_job_access
from .job_reprocess_service import JobReprocessService
from .job_service import JobService


STREAM_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Connection": "keep-alive",
    "Transfer-Encoding": "chunked",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
}


class JobAnalysisWorkflowService:
    def __init__(
        self,
        *,
        chat_service: JobAnalysisChatService,
        chat_history_service: JobChatHistoryService,
        job_service: JobService,
        reprocess_service: JobReprocessService,
    ) -> None:
        self.chat_service = chat_service
        self.chat_history_service = chat_history_service
        self.job_service = job_service
        self.reprocess_service = reprocess_service

    def stream_analysis_chat(
        self,
        *,
        job_id: str,
        message: str | None,
        conversation_history: list[ChatMessage] | None,
        max_tokens: int,
        current_user: dict[str, Any],
        ag_ui_messages: list[dict[str, Any]] | None = None,
        thread_id: str | None = None,
        run_id: str | None = None,
        state: dict[str, Any] | None = None,
    ) -> StreamingResponse:
        return StreamingResponse(
            self.chat_service.stream_chat_response(
                job_id=job_id,
                message=message or "",
                conversation_history=conversation_history or [],
                max_tokens=max_tokens,
                current_user=current_user,
                ag_ui_messages=ag_ui_messages,
                thread_id=thread_id,
                run_id=run_id,
                state=state,
            ),
            media_type="text/event-stream",
            headers=STREAM_HEADERS,
        )

    async def _get_authorized_job(
        self,
        *,
        job_id: str,
        current_user: dict[str, Any],
        required_permission: str,
    ) -> dict[str, Any]:
        job = await self.job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)
        if not check_job_access(job, current_user, required_permission):
            raise PermissionError("Access denied to job")
        return job

    async def save_chat_message(
        self,
        *,
        job_id: str,
        role: str,
        content: str,
        current_user: dict[str, Any],
    ) -> JSONResponse:
        job = await self._get_authorized_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="edit",
        )
        chat_history_length = await self.chat_history_service.save_message(
            job_id,
            job=job,
            role=role,
            content=content,
        )
        return JSONResponse({"status": "saved", "chat_history_length": chat_history_length})

    async def get_chat_history(self, *, job_id: str, current_user: dict[str, Any]) -> JSONResponse:
        job = await self._get_authorized_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="view",
        )
        chat_history = await self.chat_history_service.get_history(job_id, job=job)
        return JSONResponse({"chat_history": chat_history})

    async def clear_chat_history(self, *, job_id: str, current_user: dict[str, Any]) -> JSONResponse:
        job = await self._get_authorized_job(
            job_id=job_id,
            current_user=current_user,
            required_permission="edit",
        )
        await self.chat_history_service.clear_history(job_id, job=job)
        return JSONResponse({"status": "cleared", "message": "Chat history cleared"})

    async def reprocess_job_analysis(
        self,
        *,
        job_id: str,
        request: ReprocessRequest,
        current_user: dict[str, Any],
    ) -> dict[str, Any] | JSONResponse:
        job = await self.job_service.get_job(job_id)
        if not job:
            raise ResourceNotFoundError("Job", job_id)

        if not check_job_access(job, current_user, "edit"):
            raise PermissionError("Access denied to job")

        result = await self.reprocess_service.reprocess_job_analysis(
            job_id=job_id,
            request_payload=request.model_dump(exclude_none=True),
            job=job,
            current_user=current_user,
        )
        if result.status_code == 200:
            return result.payload
        return JSONResponse(status_code=result.status_code, content=result.payload)
