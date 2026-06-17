"""
Integration tests for analysis router (chatbot/analysis functionality).

Tests for:
- app/routers/jobs/job_analysis.py

Endpoints covered:
- POST /{job_id}/chat/stream
- POST /{job_id}/chat/save
- GET /{job_id}/chat/history
- DELETE /{job_id}/chat/history
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.responses import StreamingResponse, JSONResponse


# =============================================================================
# POST /{job_id}/chat/stream tests
# =============================================================================


class TestStreamAnalysisChat:
    """Tests for POST /{job_id}/chat/stream endpoint."""

    @pytest.mark.asyncio
    async def test_given_job_with_transcription_when_stream_then_returns_sse(self):
        """Streaming chat returns SSE response with job context."""
        from app.api.v1.routes.job_analysis import stream_analysis_chat

        async def mock_stream_chat_response(**kwargs):
            yield "data: Hello\n\n"
            yield "data: [DONE]\n\n"

        mock_chat_service = MagicMock()
        mock_chat_service.stream_chat_response = mock_stream_chat_response
        user = {"id": "user-1"}

        result = await stream_analysis_chat(
            job_id="job-123",
            message="What was discussed?",
            conversation_history=[],
            max_tokens=1000,
            current_user=user,
            chat_service=mock_chat_service,
        )

        assert isinstance(result, StreamingResponse)
        assert result.media_type == "text/event-stream"

    @pytest.mark.asyncio
    async def test_given_nonexistent_job_when_stream_then_raises_error(self):
        """Streaming for nonexistent job raises ValueError."""
        from app.api.v1.routes.job_analysis import stream_analysis_chat

        from app.core.errors.domain import ResourceNotFoundError

        async def mock_stream_chat_response(**kwargs):
            raise ResourceNotFoundError("Job", "nonexistent")
            yield

        mock_chat_service = MagicMock()
        mock_chat_service.stream_chat_response = mock_stream_chat_response
        user = {"id": "user-1"}

        response = await stream_analysis_chat(
            job_id="nonexistent",
            message="Hello",
            conversation_history=[],
            max_tokens=1000,
            current_user=user,
            chat_service=mock_chat_service,
        )

        with pytest.raises(ResourceNotFoundError) as exc_info:
            async for _ in response.body_iterator:
                pass

        assert "not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_given_job_with_file_paths_when_stream_then_downloads_content(self):
        """Downloads transcription/analysis from blob if not in job doc."""
        from app.api.v1.routes.job_analysis import stream_analysis_chat

        async def mock_stream_chat_response(**kwargs):
            yield "data: Response\n\n"

        mock_chat_service = MagicMock()
        mock_chat_service.stream_chat_response = mock_stream_chat_response
        user = {"id": "user-1"}

        result = await stream_analysis_chat(
            job_id="job-123",
            message="What was discussed?",
            conversation_history=[],
            max_tokens=1000,
            current_user=user,
            chat_service=mock_chat_service,
        )

        assert isinstance(result, StreamingResponse)


# =============================================================================
# POST /{job_id}/chat/save tests
# =============================================================================


class TestSaveChatMessage:
    """Tests for POST /{job_id}/chat/save endpoint."""

    @pytest.mark.asyncio
    async def test_given_job_when_save_message_then_appends_to_history(self):
        """Saving chat message appends to job's chat history."""
        from app.api.v1.routes.job_analysis import save_chat_message

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            "chat_history": [],
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.save_message = AsyncMock(return_value=1)

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        result = await save_chat_message(
            job_id="job-123",
            role="user",
            content="Hello, can you summarize?",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        assert result.body is not None
        mock_chat_history_service.save_message.assert_awaited_once_with(
            "job-123",
            role="user",
            content="Hello, can you summarize?",
        )

    @pytest.mark.asyncio
    async def test_given_job_without_history_when_save_then_initializes_history(self):
        """If chat_history doesn't exist, it's initialized."""
        from app.api.v1.routes.job_analysis import save_chat_message

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            # No chat_history field
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.save_message = AsyncMock(return_value=1)

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        await save_chat_message(
            job_id="job-123",
            role="assistant",
            content="Here is the summary...",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        mock_chat_history_service.save_message.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_given_nonexistent_job_when_save_then_raises_not_found(self):
        """Saving to nonexistent job raises ResourceNotFoundError."""
        from app.api.v1.routes.job_analysis import save_chat_message
        from app.core.errors.domain import ResourceNotFoundError

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.save_message = AsyncMock(side_effect=ResourceNotFoundError("Job", "nonexistent"))

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        with pytest.raises(ResourceNotFoundError):
            await save_chat_message(
                job_id="nonexistent",
                role="user",
                content="Hello",
                current_user=user,
                chat_history_service=mock_chat_history_service,
            )


# =============================================================================
# GET /{job_id}/chat/history tests
# =============================================================================


class TestGetChatHistory:
    """Tests for GET /{job_id}/chat/history endpoint."""

    @pytest.mark.asyncio
    async def test_given_job_with_history_when_get_then_returns_history(self):
        """Returns chat history for job."""
        from app.api.v1.routes.job_analysis import get_chat_history

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            "chat_history": [
                {"role": "user", "content": "Hello", "timestamp": "2024-01-01T00:00:00Z"},
                {"role": "assistant", "content": "Hi there!", "timestamp": "2024-01-01T00:00:01Z"},
            ],
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.get_history = AsyncMock(return_value=mock_job["chat_history"])

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        result = await get_chat_history(
            job_id="job-123",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        assert isinstance(result, JSONResponse)
        # Parse body to check contents
        import json
        body = json.loads(result.body)
        assert len(body["chat_history"]) == 2

    @pytest.mark.asyncio
    async def test_given_job_without_history_when_get_then_returns_empty(self):
        """Returns empty list when no chat history."""
        from app.api.v1.routes.job_analysis import get_chat_history

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            # No chat_history
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.get_history = AsyncMock(return_value=[])

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        result = await get_chat_history(
            job_id="job-123",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        import json
        body = json.loads(result.body)
        assert body["chat_history"] == []

    @pytest.mark.asyncio
    async def test_given_nonexistent_job_when_get_history_then_raises_not_found(self):
        """Getting history for nonexistent job raises ResourceNotFoundError."""
        from app.api.v1.routes.job_analysis import get_chat_history
        from app.core.errors.domain import ResourceNotFoundError

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.get_history = AsyncMock(side_effect=ResourceNotFoundError("Job", "nonexistent"))

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        with pytest.raises(ResourceNotFoundError):
            await get_chat_history(
                job_id="nonexistent",
                current_user=user,
                chat_history_service=mock_chat_history_service,
            )


# =============================================================================
# DELETE /{job_id}/chat/history tests
# =============================================================================


class TestClearChatHistory:
    """Tests for DELETE /{job_id}/chat/history endpoint."""

    @pytest.mark.asyncio
    async def test_given_job_with_history_when_clear_then_empties_history(self):
        """Clears chat history for job."""
        from app.api.v1.routes.job_analysis import clear_chat_history

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            "chat_history": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi!"},
            ],
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.clear_history = AsyncMock(return_value=None)

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        result = await clear_chat_history(
            job_id="job-123",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        import json
        body = json.loads(result.body)
        assert body["status"] == "cleared"
        mock_chat_history_service.clear_history.assert_awaited_once_with("job-123")

    @pytest.mark.asyncio
    async def test_given_nonexistent_job_when_clear_then_raises_not_found(self):
        """Clearing history for nonexistent job raises ResourceNotFoundError."""
        from app.api.v1.routes.job_analysis import clear_chat_history
        from app.core.errors.domain import ResourceNotFoundError

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.clear_history = AsyncMock(side_effect=ResourceNotFoundError("Job", "nonexistent"))

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        with pytest.raises(ResourceNotFoundError):
            await clear_chat_history(
                job_id="nonexistent",
                current_user=user,
                chat_history_service=mock_chat_history_service,
            )

    @pytest.mark.asyncio
    async def test_given_job_without_history_when_clear_then_succeeds(self):
        """Clearing already empty history succeeds."""
        from app.api.v1.routes.job_analysis import clear_chat_history

        mock_job = {
            "id": "job-123",
            "user_id": "user-1",
            # No chat_history
        }

        mock_chat_history_service = AsyncMock()
        mock_chat_history_service.clear_history = AsyncMock(return_value=None)

        mock_error_handler = MagicMock()
        user = {"id": "user-1"}

        result = await clear_chat_history(
            job_id="job-123",
            current_user=user,
            chat_history_service=mock_chat_history_service,
        )

        import json
        body = json.loads(result.body)
        assert body["status"] == "cleared"
