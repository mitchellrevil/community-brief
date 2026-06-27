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
async def test_chat_history_methods_allow_owner_and_admin():
    chat_history_service = MagicMock()
    chat_history_service.save_message = AsyncMock(return_value=1)
    chat_history_service.get_history = AsyncMock(return_value=[{"role": "user", "content": "hi"}])
    chat_history_service.clear_history = AsyncMock(return_value=None)
    job = {"id": "j1", "user_id": "owner", "chat_history": [{"role": "user", "content": "hi"}]}

    for current_user in ({"id": "owner"}, {"id": "admin", "permission": "admin"}):
        job_service = MagicMock()
        job_service.get_job = AsyncMock(return_value=job)
        workflow = _workflow(chat_history_service=chat_history_service, job_service=job_service)

        assert isinstance(
            await workflow.save_chat_message(
                job_id="j1",
                role="user",
                content="hello",
                current_user=current_user,
            ),
            JSONResponse,
        )
        assert isinstance(
            await workflow.get_chat_history(job_id="j1", current_user=current_user),
            JSONResponse,
        )
        assert isinstance(
            await workflow.clear_chat_history(job_id="j1", current_user=current_user),
            JSONResponse,
        )

    assert chat_history_service.save_message.await_count == 2
    chat_history_service.get_history.await_count == 2
    assert chat_history_service.clear_history.await_count == 2
    chat_history_service.save_message.assert_any_await("j1", job=job, role="user", content="hello")
    chat_history_service.get_history.assert_any_await("j1", job=job)
    chat_history_service.clear_history.assert_any_await("j1", job=job)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method_name", "kwargs"),
    [
        ("save_chat_message", {"role": "user", "content": "hello"}),
        ("get_chat_history", {}),
        ("clear_chat_history", {}),
    ],
)
async def test_chat_history_methods_reject_unrelated_user(method_name, kwargs):
    chat_history_service = MagicMock()
    chat_history_service.save_message = AsyncMock()
    chat_history_service.get_history = AsyncMock()
    chat_history_service.clear_history = AsyncMock()
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1", "user_id": "owner"})
    workflow = _workflow(chat_history_service=chat_history_service, job_service=job_service)

    with pytest.raises(PermissionError):
        await getattr(workflow, method_name)(
            job_id="j1",
            current_user={"id": "intruder"},
            **kwargs,
        )

    chat_history_service.save_message.assert_not_awaited()
    chat_history_service.get_history.assert_not_awaited()
    chat_history_service.clear_history.assert_not_awaited()


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
