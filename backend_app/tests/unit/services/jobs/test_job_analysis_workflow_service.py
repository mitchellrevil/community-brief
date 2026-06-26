from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import JSONResponse, StreamingResponse

from backend_app.app.core.errors.domain import PermissionError, ResourceNotFoundError
from backend_app.app.schemas.job_analysis import ReprocessRequest
from backend_app.app.services.jobs.job_analysis_workflow_service import JobAnalysisWorkflowService
from backend_app.app.services.jobs.job_reprocess_service import JobReprocessResult


def _workflow(
    *,
    chat_service: MagicMock | None = None,
    chat_history_service: MagicMock | None = None,
    job_service: MagicMock | None = None,
    reprocess_service: MagicMock | None = None,
) -> JobAnalysisWorkflowService:
    return JobAnalysisWorkflowService(
        chat_service=chat_service or MagicMock(),
        chat_history_service=chat_history_service or MagicMock(),
        job_service=job_service or MagicMock(),
        reprocess_service=reprocess_service or MagicMock(),
    )


@pytest.mark.asyncio
async def test_stream_analysis_chat_returns_streaming_response():
    async def stream(**kwargs):
        yield "data: ok\n\n"

    chat_service = MagicMock()
    chat_service.stream_chat_response = stream

    response = _workflow(chat_service=chat_service).stream_analysis_chat(
        job_id="j1",
        message="hi",
        conversation_history=[],
        max_tokens=100,
        current_user={"id": "u1"},
        ag_ui_messages=None,
        thread_id=None,
        run_id=None,
        state=None,
    )

    assert isinstance(response, StreamingResponse)
    chunks = [chunk async for chunk in response.body_iterator]
    assert chunks == ["data: ok\n\n"]


@pytest.mark.asyncio
async def test_chat_history_methods_shape_json_responses():
    chat_history_service = MagicMock()
    chat_history_service.save_message = AsyncMock(return_value=1)
    chat_history_service.get_history = AsyncMock(return_value=[{"role": "user", "content": "hi"}])
    chat_history_service.clear_history = AsyncMock(return_value=None)
    workflow = _workflow(chat_history_service=chat_history_service)

    assert isinstance(await workflow.save_chat_message(job_id="j1", role="user", content="hello"), JSONResponse)
    assert isinstance(await workflow.get_chat_history(job_id="j1"), JSONResponse)
    assert isinstance(await workflow.clear_chat_history(job_id="j1"), JSONResponse)

    chat_history_service.save_message.assert_awaited_once_with("j1", role="user", content="hello")
    chat_history_service.get_history.assert_awaited_once_with("j1")
    chat_history_service.clear_history.assert_awaited_once_with("j1")


@pytest.mark.asyncio
async def test_reprocess_job_analysis_delegates_to_service_when_authorized(monkeypatch):
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1", "displayname": "Board sync"})
    reprocess_service = MagicMock()
    reprocess_service.reprocess_job_analysis = AsyncMock(
        return_value=JobReprocessResult(200, {"status": "success"})
    )
    monkeypatch.setattr(
        "backend_app.app.services.jobs.job_analysis_workflow_service.check_job_access",
        lambda job, user, permission: True,
    )
    workflow = _workflow(job_service=job_service, reprocess_service=reprocess_service)

    result = await workflow.reprocess_job_analysis(
        job_id="j1",
        request=ReprocessRequest(
            instructions="Use the new prompt",
            prompt_category_id="cat-2",
            prompt_subcategory_id="sub-2",
            create_new_job=True,
        ),
        current_user={"id": "u1"},
    )

    assert result == {"status": "success"}
    reprocess_service.reprocess_job_analysis.assert_awaited_once_with(
        job_id="j1",
        request_payload={
            "instructions": "Use the new prompt",
            "prompt_category_id": "cat-2",
            "prompt_subcategory_id": "sub-2",
            "create_new_job": True,
        },
        job={"id": "j1", "displayname": "Board sync"},
        current_user={"id": "u1"},
    )


@pytest.mark.asyncio
async def test_reprocess_job_analysis_returns_json_response_for_non_200(monkeypatch):
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    reprocess_service = MagicMock()
    reprocess_service.reprocess_job_analysis = AsyncMock(
        return_value=JobReprocessResult(202, {"status": "accepted"})
    )
    monkeypatch.setattr(
        "backend_app.app.services.jobs.job_analysis_workflow_service.check_job_access",
        lambda job, user, permission: True,
    )
    workflow = _workflow(job_service=job_service, reprocess_service=reprocess_service)

    result = await workflow.reprocess_job_analysis(
        job_id="j1",
        request=ReprocessRequest(),
        current_user={"id": "u1"},
    )

    assert isinstance(result, JSONResponse)
    assert result.status_code == 202


@pytest.mark.asyncio
async def test_reprocess_job_analysis_raises_for_missing_or_inaccessible_job(monkeypatch):
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value=None)
    workflow = _workflow(job_service=job_service)

    with pytest.raises(ResourceNotFoundError):
        await workflow.reprocess_job_analysis(
            job_id="missing",
            request=ReprocessRequest(),
            current_user={"id": "u1"},
        )

    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    monkeypatch.setattr(
        "backend_app.app.services.jobs.job_analysis_workflow_service.check_job_access",
        lambda job, user, permission: False,
    )
    with pytest.raises(PermissionError):
        await workflow.reprocess_job_analysis(
            job_id="j1",
            request=ReprocessRequest(),
            current_user={"id": "u1"},
        )
