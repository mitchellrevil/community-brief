import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_framework import AgentResponseUpdate, Content, ResponseStream

from app.core.errors.domain import PermissionError
from app.services.agent_chat.runner_registry import ag_ui_agent_runners
from app.services.jobs.job_analysis_chat_service import JobAnalysisChatService


@pytest.fixture
def chat_history_service():
    service = MagicMock()
    service.get_job = AsyncMock()
    service.store_response_id = AsyncMock()
    service.update_analysis_text = AsyncMock()
    return service


@pytest.fixture
def storage_service():
    service = MagicMock()
    service.download_text_from_blob = AsyncMock()
    service.download_docx_text_from_blob = AsyncMock()
    service.upload_text_to_blob = AsyncMock()
    return service


class FakeAgent:
    default_options = {}

    def __init__(self):
        self.messages = []
        self.kwargs = {}
        self.queued_contents = []

    def run(self, messages, stream=False, **kwargs):
        self.messages = messages
        self.kwargs = kwargs

        async def gen():
            if self.queued_contents:
                for contents in self.queued_contents.pop(0):
                    yield AgentResponseUpdate(contents=contents, response_id="resp-123")
                return
            yield AgentResponseUpdate(contents=[Content.from_text("chunk1")], response_id="resp-123")
            yield AgentResponseUpdate(contents=[Content.from_text("chunk2")], response_id="resp-123")

        return ResponseStream(gen())


class ChatStub:
    def __init__(self):
        self.calls = []
        self.agent = FakeAgent()

    def build_agent(self, **kwargs):
        self.calls.append(kwargs)
        self.agent.default_options = {"tools": kwargs.get("tools", [])}
        return self.agent


def _events(chunks):
    return [json.loads(chunk.removeprefix("data: ").strip()) for chunk in chunks]


@pytest.mark.asyncio
async def test_stream_chat_response_loads_context_and_emits_ag_ui_events(chat_history_service, storage_service):
    job = {
        "id": "j1",
        "user_id": "u1",
        "text_content": "hello world",
        "analysis_file_path": "analysis.md",
    }
    chat_history_service.get_job.return_value = job
    storage_service.download_text_from_blob.return_value = "analysis content"
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="hey",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "u1"},
        )
    ]

    events = _events(chunks)
    assert [event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT"] == ["chunk1", "chunk2"]
    assert events[0]["type"] == "RUN_STARTED"
    assert events[-1]["type"] == "RUN_FINISHED"
    assert "TRANSCRIPTION:\nhello world" in chatbot.calls[0]["instructions"]
    assert "ANALYSIS:\nanalysis content" in chatbot.calls[0]["instructions"]
    assert chatbot.calls[0]["max_tokens"] == 100
    assert len(chatbot.calls[0]["tools"]) == 3
    chat_history_service.store_response_id.assert_not_called()


@pytest.mark.asyncio
async def test_stream_chat_response_converts_legacy_history_to_ag_ui_messages(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1", "user_id": "u1"}
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    previous = MagicMock(role="user", content="previous")

    [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="next",
            conversation_history=[previous],
            max_tokens=100,
            current_user={"id": "u1"},
        )
    ]

    assert [(message.role, message.text) for message in chatbot.agent.messages] == [
        ("user", "previous"),
        ("user", "next"),
    ]


@pytest.mark.asyncio
async def test_stream_chat_response_prefers_ag_ui_messages(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1", "user_id": "u1"}
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    previous = MagicMock(role="user", content="legacy")

    [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="legacy next",
            conversation_history=[previous],
            max_tokens=100,
            current_user={"id": "u1"},
            ag_ui_messages=[{"role": "user", "content": "ag-ui"}],
        )
    ]

    assert [(message.role, message.text) for message in chatbot.agent.messages] == [("user", "ag-ui")]


@pytest.mark.asyncio
async def test_stream_chat_response_emits_ag_ui_error_when_user_cannot_view(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1", "user_id": "owner"}
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="next",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "u1"},
            thread_id="thread-1",
            run_id="run-1",
        )
    ]

    assert _events(chunks) == [
        {
            "type": "RUN_ERROR",
            "threadId": "thread-1",
            "runId": "run-1",
            "message": "Access denied to job",
        }
    ]


@pytest.mark.asyncio
async def test_apply_analysis_patch_updates_markdown_when_edit_allowed(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {
        "id": "j1",
        "user_id": "owner",
        "analysis_file_path": "https://storage.blob.core.windows.net/jobs/analysis.md?sig=1",
    }
    storage_service.download_text_from_blob.return_value = "A old B old"
    service = JobAnalysisChatService(ChatStub(), chat_history_service, storage_service)

    result = await service.apply_analysis_patch(
        job_id="j1",
        current_user={"id": "owner"},
        old_text="old",
        new_text="new",
    )

    assert result["status"] == "applied"
    assert result["analysis_text"] == "A new B old"
    storage_service.upload_text_to_blob.assert_awaited_once_with(
        "https://storage.blob.core.windows.net/jobs/analysis.md?sig=1",
        "A new B old",
        content_type="text/markdown; charset=utf-8",
    )
    chat_history_service.update_analysis_text.assert_awaited_once_with("j1", "A new B old")


@pytest.mark.asyncio
async def test_stream_chat_response_executes_approved_apply_patch(chat_history_service, storage_service):
    ag_ui_agent_runners.clear()
    chat_history_service.get_job.return_value = {
        "id": "j1",
        "user_id": "owner",
        "analysis_file_path": "https://storage.blob.core.windows.net/jobs/analysis.md",
    }
    storage_service.download_text_from_blob.return_value = "old text"
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    tool_call = Content.from_function_call(
        call_id="patch-1",
        name="apply_patch",
        arguments={"old_text": "old", "new_text": "new"},
    )
    chatbot.agent.queued_contents = [
        [[Content.from_function_approval_request(id="patch-1", function_call=tool_call)]],
        [[Content.from_text("done")]],
    ]
    thread_id = "job-approval-test"

    first_chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="Patch it",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "owner"},
            thread_id=thread_id,
        )
    ]

    assert "function_approval_request" in "".join(first_chunks)

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "owner"},
            thread_id=thread_id,
            ag_ui_messages=[
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "patch-1",
                            "type": "function",
                            "function": {
                                "name": "apply_patch",
                                "arguments": '{"old_text":"old","new_text":"new"}',
                            },
                        }
                    ],
                }
            ],
            resume={"id": "patch-1", "value": {"accepted": True, "function_call_id": "patch-1"}},
        )
    ]

    events = _events(chunks)
    assert any(event["type"] == "ANALYSIS_UPDATED" and event["analysisText"] == "new text" for event in events)
    assert any(
        message.role == "tool"
        and message.contents
        and message.contents[0].type == "function_result"
        and message.contents[0].call_id == "patch-1"
        and "analysis.md updated." in str(message.contents[0].result)
        for message in chatbot.agent.messages
    )
    storage_service.upload_text_to_blob.assert_awaited_once()
    chat_history_service.update_analysis_text.assert_awaited_once_with("j1", "new text")


@pytest.mark.asyncio
async def test_stream_chat_response_rejects_apply_patch_without_writing(chat_history_service, storage_service):
    ag_ui_agent_runners.clear()
    chat_history_service.get_job.return_value = {
        "id": "j1",
        "user_id": "owner",
        "analysis_file_path": "https://storage.blob.core.windows.net/jobs/analysis.md",
    }
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    tool_call = Content.from_function_call(
        call_id="patch-1",
        name="apply_patch",
        arguments={"old_text": "old", "new_text": "new"},
    )
    chatbot.agent.queued_contents = [
        [[Content.from_function_approval_request(id="patch-1", function_call=tool_call)]],
        [[Content.from_text("done")]],
    ]
    thread_id = "job-rejection-test"

    first_chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="Patch it",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "owner"},
            thread_id=thread_id,
        )
    ]

    assert "function_approval_request" in "".join(first_chunks)

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "owner"},
            thread_id=thread_id,
            ag_ui_messages=[
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "patch-1",
                            "type": "function",
                            "function": {
                                "name": "apply_patch",
                                "arguments": '{"old_text":"old","new_text":"new"}',
                            },
                        }
                    ],
                }
            ],
            resume={"id": "patch-1", "value": {"accepted": False, "function_call_id": "patch-1"}},
        )
    ]

    assert any(
        message.role == "tool"
        and message.contents
        and message.contents[0].type == "function_result"
        and message.contents[0].call_id == "patch-1"
        and "rejected by user" in str(message.contents[0].result).lower()
        for message in service.chatbot_service.agent.messages
    )
    storage_service.upload_text_to_blob.assert_not_called()


@pytest.mark.asyncio
async def test_apply_analysis_patch_requires_edit_permission(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {
        "id": "j1",
        "user_id": "owner",
        "analysis_file_path": "https://storage.blob.core.windows.net/jobs/analysis.md",
        "shared_with": [{"user_id": "u2", "permission_level": "view"}],
    }
    service = JobAnalysisChatService(ChatStub(), chat_history_service, storage_service)

    with pytest.raises(PermissionError):
        await service.apply_analysis_patch(
            job_id="j1",
            current_user={"id": "u2"},
            old_text="old",
            new_text="new",
        )

    storage_service.upload_text_to_blob.assert_not_called()


def test_analysis_updated_event_contains_latest_analysis_text():
    event = JobAnalysisChatService._analysis_updated_event("j1", "new analysis")

    assert _events([event]) == [
        {
            "type": "ANALYSIS_UPDATED",
            "jobId": "j1",
            "analysisText": "new analysis",
        }
    ]


@pytest.mark.asyncio
async def test_apply_analysis_patch_gracefully_skips_non_markdown_analysis(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {
        "id": "j1",
        "user_id": "owner",
        "analysis_file_path": "https://storage.blob.core.windows.net/jobs/analysis.docx",
    }
    service = JobAnalysisChatService(ChatStub(), chat_history_service, storage_service)

    result = await service.apply_analysis_patch(
        job_id="j1",
        current_user={"id": "owner"},
        old_text="old",
        new_text="new",
    )

    assert result["status"] == "unsupported"
    storage_service.upload_text_to_blob.assert_not_called()
