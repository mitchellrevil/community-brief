"""
ChatBot service for Azure OpenAI chat interactions with streaming support.
Uses the Azure OpenAI Responses API for chat interactions.
"""

from typing import AsyncGenerator, Callable

from openai import AsyncOpenAI, APIError, OpenAIError

from ...core.logging import get_logger

try:
    from azure.identity import DefaultAzureCredential, get_bearer_token_provider
except (ImportError, ModuleNotFoundError):
    DefaultAzureCredential = None
    get_bearer_token_provider = None

logger = get_logger(__name__)


REASONING_CAPABLE_MODELS = {"gpt-5.1", "gpt-5-mini", "gpt-5-nano"}


class _ManagedIdentityAsyncOpenAI(AsyncOpenAI):
    """OpenAI client variant that fetches Azure AD tokens per request."""

    def __init__(self, *, token_provider: Callable[[], str], **kwargs) -> None:
        self._token_provider = token_provider
        super().__init__(**kwargs)

    @property
    def auth_headers(self) -> dict[str, str]:
        token = self._token_provider()
        if not token:
            raise RuntimeError("Managed identity token provider returned an empty token")
        return {"Authorization": f"Bearer {token}"}


class ChatBotService:
    def __init__(
        self,
        azure_endpoint: str,
        api_key: str | None = None,
        api_version: str = "2024-12-01-preview",
        model_deployment_name: str = "o3-mini",
        credential=None,
    ):
        # Preserve provided settings for visibility and testing
        self._azure_endpoint = azure_endpoint
        self._api_key = api_key
        self._api_version = api_version
        self._model_deployment_name = model_deployment_name

        # Build Responses API base URL
        base_endpoint = (azure_endpoint or "").rstrip("/")
        if not base_endpoint:
            raise RuntimeError("Azure OpenAI endpoint is required for chatbot service")
        base_url = base_endpoint if base_endpoint.endswith("/openai/v1") else f"{base_endpoint}/openai/v1"

        if api_key:
            logger.info("chatbot_client_initialized", auth_method="api_key")
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
            )
            self._auth_method = "api_key"
        elif credential is not None:
            if get_bearer_token_provider is None:
                raise RuntimeError("get_bearer_token_provider unavailable; azure.identity >= 1.16 required")
            logger.info("chatbot_client_initialized", auth_method="credential")
            token_provider = get_bearer_token_provider(credential, "https://ai.azure.com/.default")
            self.client = _ManagedIdentityAsyncOpenAI(
                api_key="managed-identity",
                base_url=base_url,
                token_provider=token_provider,
            )
            self._auth_method = "credential"
        elif DefaultAzureCredential is not None:
            if get_bearer_token_provider is None:
                raise RuntimeError("get_bearer_token_provider unavailable; azure.identity >= 1.16 required")
            logger.info("chatbot_client_initialized", auth_method="default_credential")
            self._default_credential = DefaultAzureCredential()
            token_provider = get_bearer_token_provider(self._default_credential, "https://ai.azure.com/.default")
            self.client = _ManagedIdentityAsyncOpenAI(
                api_key="managed-identity",
                base_url=base_url,
                token_provider=token_provider,
            )
            self._auth_method = "default_credential"
        else:
            error_msg = (
                "No authentication method available for Azure OpenAI client. "
                "Please provide an API key, pass an Azure credential instance, "
                "or ensure Azure Managed Identity is configured and "
                "DefaultAzureCredential is available."
            )
            logger.error("chatbot_client_auth_unavailable")
            raise RuntimeError(error_msg)

        self.model_deployment_name = model_deployment_name
        self.system_prompt = (
            "You are a helpful AI assistant. Be concise, clear, and helpful in your responses."
        )

    def _build_input(
        self,
        message: str,
        conversation_history: list[dict] | None,
        use_previous_response_id: bool = False,
    ) -> list[dict]:
        """
        Build input messages for Responses API.
        
        When use_previous_response_id=True, only send system prompt + current message
        because the API maintains conversation state internally.
        
        When use_previous_response_id=False, send full conversation history.
        """
        messages = [{"role": "system", "content": self.system_prompt}]
        
        # Only include conversation history if we're NOT using response ID chaining
        if not use_previous_response_id and conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": message})
        return messages

    def _should_set_temperature(self) -> bool:
        return self.model_deployment_name not in REASONING_CAPABLE_MODELS

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
        max_tokens: int = 1000,
        previous_response_id: str | None = None,
        on_response_id: Callable[[str], None] | None = None,
    ) -> AsyncGenerator[str, None]:
        try:
            # When chaining via previous_response_id, don't send conversation history
            # The API maintains conversation state internally
            use_chaining = previous_response_id is not None
            messages = self._build_input(message, conversation_history, use_previous_response_id=use_chaining)

            logger.info(
                "chat_stream_started",
                message_count=len(messages),
                chaining=use_chaining,
                has_previous_id=bool(previous_response_id),
            )

            request_kwargs = {
                "model": self.model_deployment_name,
                "input": messages,
                "max_output_tokens": max_tokens,
            }

            if previous_response_id:
                request_kwargs["previous_response_id"] = previous_response_id

            if self._should_set_temperature():
                request_kwargs["temperature"] = 0.7

            if hasattr(self.client.responses, "stream"):
                async with self.client.responses.stream(**request_kwargs) as stream:
                    async for event in stream:
                        event_type = getattr(event, "type", "")
                        if event_type == "response.output_text.delta":
                            delta = getattr(event, "delta", None)
                            if delta:
                                yield delta

                    get_final_response = getattr(stream, "get_final_response", None)
                    if callable(get_final_response):
                        final_response = await get_final_response()
                        response_id = getattr(final_response, "id", None)
                        if response_id and on_response_id:
                            on_response_id(response_id)

                logger.info("chat_stream_completed", streaming=True)
                return

            response = await self.client.responses.create(**request_kwargs)
            output_text = getattr(response, "output_text", "")
            response_id = getattr(response, "id", None)
            if response_id and on_response_id:
                on_response_id(response_id)
            if output_text:
                yield output_text
            logger.info("chat_stream_completed", streaming=False)

        except APIError as e:
            logger.error(
                "chat_stream_api_error",
                exc_info=True,
                error=str(e),
                error_type=type(e).__name__,
                auth_method=getattr(self, "_auth_method", None),
            )
            raise
        except (OpenAIError, RuntimeError, ValueError, TypeError) as e:
            logger.error(
                "chat_stream_failed",
                exc_info=True,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    async def chat_complete(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
        max_tokens: int = 1000,
        previous_response_id: str | None = None,
        on_response_id: Callable[[str], None] | None = None,
    ) -> str:
        """
        Get a complete chatbot response (non-streaming).

        Args:
            message: The user's message
            conversation_history: Optional list of previous messages (ignored if previous_response_id provided)
            max_tokens: Maximum tokens in the response
            previous_response_id: Previous response ID for conversation chaining
            on_response_id: Callback to capture the response ID

        Returns:
            Complete response text

        Example:
            response = await service.chat_complete("What is Python?")
        """
        try:
            use_chaining = previous_response_id is not None
            messages = self._build_input(message, conversation_history, use_previous_response_id=use_chaining)

            request_kwargs = {
                "model": self.model_deployment_name,
                "input": messages,
                "max_output_tokens": max_tokens,
            }

            if previous_response_id:
                request_kwargs["previous_response_id"] = previous_response_id

            if self._should_set_temperature():
                request_kwargs["temperature"] = 0.7

            response = await self.client.responses.create(**request_kwargs)
            response_id = getattr(response, "id", None)
            if response_id and on_response_id:
                on_response_id(response_id)
            return response.output_text

        except APIError as e:
            logger.error(
                "chat_complete_api_error",
                exc_info=True,
                error=str(e),
                error_type=type(e).__name__,
                auth_method=getattr(self, "_auth_method", None),
            )
            raise
        except (OpenAIError, RuntimeError, ValueError, TypeError) as e:
            logger.error(
                "chat_complete_failed",
                exc_info=True,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise
