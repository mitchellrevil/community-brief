from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.responses import JSONResponse, StreamingResponse

from backend_app.app.api.v1.routes import job_analysis
from backend_app.app.schemas.job_analysis import ReprocessRequest


@pytest.mark.asyncio
async def test_stream_analysis_chat_delegates_to_workflow():
    workflow = MagicMock()
    workflow.stream_analysis_chat.return_value = StreamingResponse(iter(()))
    current_user = {"id": "u1"}

    response = await job_analysis.stream_analysis_chat(
        "j1",
        message="hi",
        conversation_history=[],
        messages=None,
        max_tokens=100,
        thread_id=None,
        run_id=None,
        state=None,
        current_user=current_user,
        workflow_service=workflow,
    )

    assert isinstance(response, StreamingResponse)
    workflow.stream_analysis_chat.assert_called_once_with(
        job_id="j1",
        message="hi",
        conversation_history=[],
        max_tokens=100,
        current_user=current_user,
        ag_ui_messages=None,
        thread_id=None,
        run_id=None,
        state=None,
    )


@pytest.mark.asyncio
async def test_chat_history_routes_delegate_to_workflow():
    workflow = AsyncMock()
    workflow.save_chat_message.return_value = JSONResponse({"status": "saved"})
    workflow.get_chat_history.return_value = JSONResponse({"chat_history": []})
    workflow.clear_chat_history.return_value = JSONResponse({"status": "cleared"})
    current_user = {"id": "u1"}

    assert isinstance(
        await job_analysis.save_chat_message(
            "j1",
            role="user",
            content="hello",
            current_user=current_user,
            workflow_service=workflow,
        ),
        JSONResponse,
    )
    assert isinstance(
        await job_analysis.get_chat_history(
            "j1",
            current_user=current_user,
            workflow_service=workflow,
        ),
        JSONResponse,
    )
    assert isinstance(
        await job_analysis.clear_chat_history(
            "j1",
            current_user=current_user,
            workflow_service=workflow,
        ),
        JSONResponse,
    )

    workflow.save_chat_message.assert_awaited_once_with(
        job_id="j1",
        role="user",
        content="hello",
        current_user=current_user,
    )
    workflow.get_chat_history.assert_awaited_once_with(job_id="j1", current_user=current_user)
    workflow.clear_chat_history.assert_awaited_once_with(job_id="j1", current_user=current_user)


@pytest.mark.asyncio
async def test_reprocess_job_analysis_delegates_to_workflow():
    workflow = AsyncMock()
    workflow.reprocess_job_analysis.return_value = {"status": "success"}
    request = ReprocessRequest(instructions="Use the new prompt")
    current_user = {"id": "u1"}

    result = await job_analysis.reprocess_job_analysis(
        "j1",
        request,
        current_user=current_user,
        workflow_service=workflow,
    )

    assert result == {"status": "success"}
    workflow.reprocess_job_analysis.assert_awaited_once_with(
        job_id="j1",
        request=request,
        current_user=current_user,
    )
