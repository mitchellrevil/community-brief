"""Job analysis routes."""

from typing import Any

from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from ....core.auth import get_current_user
from ....core.rate_limit import expensive_operation_limit
from ....deps import get_job_analysis_workflow_service
from ....schemas.job_analysis import ChatMessage, ReprocessRequest
from ....services.jobs.job_analysis_workflow_service import JobAnalysisWorkflowService

router = APIRouter(
    prefix="/jobs",
    tags=["job-analysis"],
    dependencies=[Depends(expensive_operation_limit)],
)


@router.post("/{job_id}/chat/stream")
async def stream_analysis_chat(
    job_id: str,
    message: str | None = Body(None, min_length=1, max_length=4000, description="User message"),
    conversation_history: list[ChatMessage] | None = Body(
        default=None,
        description="Previous messages in conversation",
    ),
    messages: list[dict[str, Any]] | None = Body(None, description="AG-UI messages"),
    max_tokens: int = Body(
        default=1000,
        ge=100,
        le=4000,
        description="Maximum tokens in response",
    ),
    thread_id: str | None = Body(None, description="AG-UI thread id"),
    run_id: str | None = Body(None, description="AG-UI run id"),
    state: dict[str, Any] | None = Body(None, description="AG-UI state"),
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: JobAnalysisWorkflowService = Depends(get_job_analysis_workflow_service),
) -> StreamingResponse:
    return workflow_service.stream_analysis_chat(
        job_id=job_id,
        message=message,
        conversation_history=conversation_history,
        max_tokens=max_tokens,
        current_user=current_user,
        ag_ui_messages=messages,
        thread_id=thread_id,
        run_id=run_id,
        state=state,
    )


@router.post("/{job_id}/chat/save")
async def save_chat_message(
    job_id: str,
    role: str = Body(..., description="Role: 'user' or 'assistant'"),
    content: str = Body(..., description="Message content"),
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: JobAnalysisWorkflowService = Depends(get_job_analysis_workflow_service),
) -> JSONResponse:
    return await workflow_service.save_chat_message(
        job_id=job_id,
        role=role,
        content=content,
        current_user=current_user,
    )


@router.get("/{job_id}/chat/history")
async def get_chat_history(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: JobAnalysisWorkflowService = Depends(get_job_analysis_workflow_service),
) -> JSONResponse:
    return await workflow_service.get_chat_history(job_id=job_id, current_user=current_user)


@router.delete("/{job_id}/chat/history")
async def clear_chat_history(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: JobAnalysisWorkflowService = Depends(get_job_analysis_workflow_service),
) -> JSONResponse:
    return await workflow_service.clear_chat_history(job_id=job_id, current_user=current_user)


@router.post("/{job_id}/reprocess", response_model=None)
async def reprocess_job_analysis(
    job_id: str,
    request: ReprocessRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    workflow_service: JobAnalysisWorkflowService = Depends(get_job_analysis_workflow_service),
) -> dict[str, Any] | JSONResponse:
    return await workflow_service.reprocess_job_analysis(
        job_id=job_id,
        request=request,
        current_user=current_user,
    )
