from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.jobs.job_analysis_chat_service import JobAnalysisChatService


@pytest.fixture
def chat_history_service():
    service = MagicMock()
    service.get_job = AsyncMock()
    service.store_response_id = AsyncMock()
    return service


@pytest.fixture
def storage_service():
    service = MagicMock()
    service.download_text_from_blob = AsyncMock()
    service.download_docx_text_from_blob = AsyncMock()
    return service


class ChatStub:
    def __init__(self):
        self.system_prompt = "original"
        self.calls = []

    async def chat_stream(self, **kwargs):
        kwargs["system_prompt"] = self.system_prompt
        self.calls.append(kwargs)
        on_response_id = kwargs.get("on_response_id")
        if on_response_id:
            on_response_id("resp-123")
        yield "chunk1"
        yield "chunk2"


@pytest.mark.asyncio
async def test_stream_chat_response_loads_context_and_stores_response_id(chat_history_service, storage_service):
    job = {
        "id": "j1",
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

    assert chunks == ["data: chunk1\n\n", "data: chunk2\n\n", "data: [DONE]\n\n"]
    assert "TRANSCRIPTION:\nhello world" in chatbot.calls[0]["system_prompt"]
    assert "ANALYSIS:\nanalysis content" in chatbot.calls[0]["system_prompt"]
    assert chatbot.system_prompt == "original"
    chat_history_service.store_response_id.assert_awaited_once_with("j1", "resp-123")


@pytest.mark.asyncio
async def test_stream_chat_response_uses_history_only_without_previous_response(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1", "chat_response_id": None}
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    message = MagicMock(role="user", content="previous")

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="next",
            conversation_history=[message],
            max_tokens=100,
            current_user={"id": "u1"},
        )
    ]

    assert chunks[-1] == "data: [DONE]\n\n"
    assert chatbot.calls[0]["conversation_history"] == [{"role": "user", "content": "previous"}]


@pytest.mark.asyncio
async def test_stream_chat_response_omits_history_when_chaining(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1", "chat_response_id": "resp-old"}
    chatbot = ChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)
    message = MagicMock(role="user", content="previous")

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="next",
            conversation_history=[message],
            max_tokens=100,
            current_user={"id": "u1"},
        )
    ]

    assert chunks[-1] == "data: [DONE]\n\n"
    assert chatbot.calls[0]["conversation_history"] == []
    assert chatbot.calls[0]["previous_response_id"] == "resp-old"


@pytest.mark.asyncio
async def test_stream_chat_response_yields_error_chunk(chat_history_service, storage_service):
    chat_history_service.get_job.return_value = {"id": "j1"}

    class FailingChatStub:
        system_prompt = "original"

        async def chat_stream(self, **kwargs):
            raise RuntimeError("boom")
            yield

    chatbot = FailingChatStub()
    service = JobAnalysisChatService(chatbot, chat_history_service, storage_service)

    chunks = [
        chunk
        async for chunk in service.stream_chat_response(
            job_id="j1",
            message="next",
            conversation_history=[],
            max_tokens=100,
            current_user={"id": "u1"},
        )
    ]

    assert chunks == ["data: [ERROR] boom\n\n"]
    assert chatbot.system_prompt == "original"
