import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.jobs.chatbot_service import ChatBotService
from openai import APIError


class _FakeResponseStream:
    def __init__(self, events, final_response):
        self._events = events
        self._final_response = final_response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def __aiter__(self):
        async def _gen():
            for event in self._events:
                yield event
        return _gen()

    async def get_final_response(self):
        return self._final_response


class _FailingResponseStream:
    """Context manager that raises an error on entry"""
    def __init__(self, error):
        self._error = error

    async def __aenter__(self):
        raise self._error

    async def __aexit__(self, exc_type, exc, tb):
        return False

@pytest.fixture
def chatbot_service():
    return ChatBotService(
        azure_endpoint="https://test.openai.azure.com",
        api_key="test-key",
        api_version="2024-02-15-preview",
        model_deployment_name="gpt-4"
    )

@pytest.mark.asyncio
class TestChatStream:
    async def test_chat_stream_success(self, chatbot_service):
        mock_event1 = MagicMock(type="response.output_text.delta", delta="Hello")
        mock_event2 = MagicMock(type="response.output_text.delta", delta=" World")
        final_response = MagicMock(id="resp-1", output_text="Hello World")

        chatbot_service.client.responses.stream = MagicMock(
            return_value=_FakeResponseStream([mock_event1, mock_event2], final_response)
        )
        
        chunks = []
        async for chunk in chatbot_service.chat_stream("Hi"):
            chunks.append(chunk)
            
        assert chunks == ["Hello", " World"]
        chatbot_service.client.responses.stream.assert_called_once()

    async def test_chat_stream_with_conversation_history(self, chatbot_service):
        """Test that conversation history is used when no previous_response_id"""
        history = [{"role": "user", "content": "First msg"}, {"role": "assistant", "content": "Reply"}]
        mock_event = MagicMock(type="response.output_text.delta", delta="Response")
        final_response = MagicMock(id="resp-2", output_text="Response")

        chatbot_service.client.responses.stream = MagicMock(
            return_value=_FakeResponseStream([mock_event], final_response)
        )
        
        chunks = []
        async for chunk in chatbot_service.chat_stream("Second msg", conversation_history=history):
            chunks.append(chunk)
            
        assert chunks == ["Response"]
        # Verify the call included the conversation history in input
        call_kwargs = chatbot_service.client.responses.stream.call_args[1]
        assert "input" in call_kwargs
        # Should have: system prompt + 2 history msgs + current msg = 4 total
        assert len(call_kwargs["input"]) == 4

    async def test_chat_stream_with_previous_response_id(self, chatbot_service):
        """Test that conversation history is IGNORED when previous_response_id exists"""
        history = [{"role": "user", "content": "First msg"}, {"role": "assistant", "content": "Reply"}]
        mock_event = MagicMock(type="response.output_text.delta", delta="Response")
        final_response = MagicMock(id="resp-3", output_text="Response")

        chatbot_service.client.responses.stream = MagicMock(
            return_value=_FakeResponseStream([mock_event], final_response)
        )
        
        response_id_captured = None
        def on_response_id(rid):
            nonlocal response_id_captured
            response_id_captured = rid
        
        chunks = []
        async for chunk in chatbot_service.chat_stream(
            "Second msg", 
            conversation_history=history,
            previous_response_id="prev-resp-id",
            on_response_id=on_response_id
        ):
            chunks.append(chunk)
            
        assert chunks == ["Response"]
        assert response_id_captured == "resp-3"
        
        # Verify the call
        call_kwargs = chatbot_service.client.responses.stream.call_args[1]
        assert "input" in call_kwargs
        assert "previous_response_id" in call_kwargs
        assert call_kwargs["previous_response_id"] == "prev-resp-id"
        # Should only have: system prompt + current msg = 2 total (history ignored)
        assert len(call_kwargs["input"]) == 2

    async def test_chat_stream_api_error(self, chatbot_service):
        chatbot_service.client.responses.stream = MagicMock(
            return_value=_FailingResponseStream(APIError(message="API Error", request=None, body=None))
        )
        
        with pytest.raises(APIError):
            async for _ in chatbot_service.chat_stream("Hi"):
                pass

@pytest.mark.asyncio
class TestChatComplete:
    async def test_chat_complete_success(self, chatbot_service):
        mock_response = MagicMock()
        mock_response.output_text = "Hello World"
        mock_response.id = "resp-2"
        
        chatbot_service.client.responses.create = AsyncMock(return_value=mock_response)
        
        response = await chatbot_service.chat_complete("Hi")
        
        assert response == "Hello World"
        chatbot_service.client.responses.create.assert_called_once()

    async def test_chat_complete_with_previous_response_id(self, chatbot_service):
        """Test chat_complete with conversation chaining"""
        history = [{"role": "user", "content": "First"}]
        mock_response = MagicMock()
        mock_response.output_text = "Chained response"
        mock_response.id = "resp-chained"
        
        chatbot_service.client.responses.create = AsyncMock(return_value=mock_response)
        
        response_id_captured = None
        def on_response_id(rid):
            nonlocal response_id_captured
            response_id_captured = rid
        
        response = await chatbot_service.chat_complete(
            "Follow up",
            conversation_history=history,
            previous_response_id="prev-123",
            on_response_id=on_response_id
        )
        
        assert response == "Chained response"
        assert response_id_captured == "resp-chained"
        
        call_kwargs = chatbot_service.client.responses.create.call_args[1]
        assert call_kwargs["previous_response_id"] == "prev-123"
        # History should be ignored when chaining
        assert len(call_kwargs["input"]) == 2  # system + current only

    async def test_chat_complete_api_error(self, chatbot_service):
        chatbot_service.client.responses.create = AsyncMock(
            side_effect=APIError(message="API Error", request=None, body=None)
        )
        
        with pytest.raises(APIError):
            await chatbot_service.chat_complete("Hi")
