"""
ChatCompletionsProvider: Analysis provider using Azure OpenAI Chat Completions API.

This provider implements the AnalysisProvider Protocol using the Chat Completions API,
which is a standard conversational API that does NOT support reasoning or verbosity parameters.
"""

from typing import Dict, Any, Optional, List, Callable
import json
import structlog
from openai import OpenAI, APITimeoutError, APIConnectionError
from config import AppConfig
from services.analysis_service import AnalysisServiceError

# Timeout for OpenAI API calls: 15 minutes (900 seconds)
OPENAI_TIMEOUT_SECONDS = 900

logger = structlog.get_logger(__name__)

PROVIDER_SERIALIZE_ERRORS = (TypeError, ValueError)
PROVIDER_IMPORT_ERRORS = (ImportError, ModuleNotFoundError)


# Base system prompt used for all analysis requests.
BASE_SYSTEM_PROMPT = (
    "You are a professional meeting analyst. Convert the provided meeting transcript into a "
    "well-structured document using Markdown formatting compatible with Microsoft Word. "
    "The user provides additional context about the meeting type or purpose—use it to tailor the report. "
    "Use numbered lists (1., 2., 3.) ONLY for sequential items like decisions or action items. "
    "Never use 0. or start lines with just a period. Indent sub-items with additional - bullets. "
    "EMPHASIS: Use **bold** for key terms and important points. Separate paragraphs and sections with blank lines. "
    "LANGUAGE: Use British English spelling (focussing, analyse, colour, organised). Write professionally but accessibly. "
    "Avoid jargon or explain it briefly. ACCURACY: Do NOT fabricate information. If unclear, mark as [unclear] or "
    "[speaker unidentified]. Preserve quotes exactly. Attribute statements to speakers when identified. "
    "STRUCTURE: Adapt based on context."
)


class ChatCompletionsProvider:
    """Analysis provider using Azure OpenAI Chat Completions API.
    
    Implements AnalysisProvider Protocol for Chat Completions API backend.
    Does NOT support reasoning.effort or text.verbosity parameters.
    """

    def __init__(self, config: AppConfig, credential: Any = None) -> None:
        """Initialize ChatCompletionsProvider.
        
        Args:
            config: Application configuration
            credential: Optional Azure credential (uses DefaultAzureCredential if None)
        """
        self.config = config
        self.credential = credential
        self.client = self._build_client()

    def _build_client(self) -> OpenAI:
        """Create an OpenAI client configured for Chat Completions API."""
        endpoint = (self.config.azure_openai_endpoint or "").rstrip("/")
        if not endpoint:
            raise ValueError("Azure OpenAI endpoint is not configured")
        
        base_url = endpoint if endpoint.endswith("/openai/v1") else f"{endpoint}/openai/v1"

        api_key = getattr(self.config, "azure_openai_api_key", None)
        if api_key:
            logger.info("chat_completions_provider_auth_selected", auth_method="api_key")
            return OpenAI(base_url=base_url, api_key=api_key)

        credential = self.credential
        if credential is None:
            try:
                from azure.identity import DefaultAzureCredential
                credential = DefaultAzureCredential()
            except PROVIDER_IMPORT_ERRORS as exc:
                raise ValueError("Managed identity authentication requires azure.identity") from exc

        logger.info("chat_completions_provider_auth_selected", auth_method="managed_identity")
        token_provider = self._get_token_provider(credential)
        return OpenAI(base_url=base_url, api_key=token_provider)

    def _get_token_provider(self, credential: Any) -> Callable[[], str]:
        """Get bearer token provider for Azure AD authentication."""
        try:
            from azure.identity import get_bearer_token_provider
        except PROVIDER_IMPORT_ERRORS as exc:
            raise ValueError("get_bearer_token_provider unavailable; azure.identity >= 1.16 required") from exc

        return get_bearer_token_provider(credential, "https://ai.azure.com/.default")

    def _split_context_payload(self, context: Any) -> tuple[str, str]:
        """Return (instructions_text, context_text) derived from the provided context.
        
        Args:
            context: Context data (str, dict, or other)
            
        Returns:
            Tuple of (instructions_text, context_text)
        """
        if context is None:
            return "", ""

        if isinstance(context, str):
            return "", context.strip()

        if isinstance(context, dict):
            instruction_parts: list[str] = []
            context_parts: list[str] = []

            user_prompt = context.get("user_prompt")
            if isinstance(user_prompt, str) and user_prompt.strip():
                instruction_parts.append(f"USER PROMPT:\n{user_prompt.strip()}")

            new_instructions = context.get("instructions")
            if isinstance(new_instructions, str) and new_instructions.strip():
                instruction_parts.append(f"ADDITIONAL INSTRUCTIONS:\n{new_instructions.strip()}")

            session_data = context.get("session_data")
            if session_data is not None:
                try:
                    serialized = json.dumps(session_data, ensure_ascii=False, indent=2)
                except PROVIDER_SERIALIZE_ERRORS:
                    serialized = str(session_data)
                instruction_parts.append("SESSION DATA:\n" + serialized)

            base_prompt = context.get("base_prompt")
            if isinstance(base_prompt, str) and base_prompt.strip():
                context_parts.append(f"BASE PROMPT:\n{base_prompt.strip()}")

            extra_context_keys = {
                key: value
                for key, value in context.items()
                if key not in {
                    "user_prompt",
                    "instructions",
                    "session_data",
                    "base_prompt",
                }
            }
            if extra_context_keys:
                try:
                    context_parts.append(
                        "ADDITIONAL CONTEXT:\n"
                        + json.dumps(extra_context_keys, ensure_ascii=False, indent=2)
                    )
                except PROVIDER_SERIALIZE_ERRORS:
                    context_parts.append("ADDITIONAL CONTEXT:\n" + str(extra_context_keys))

            instructions_text = "\n\n".join(instruction_parts).strip()
            context_text = "\n\n".join(context_parts).strip()
            return instructions_text, context_text

        return "", str(context).strip()

    def _build_messages(self, conversation: str, instructions_text: str, context_text: str) -> List[Dict[str, str]]:
        """Build messages array for Chat Completions API.
        
        Args:
            conversation: Conversation text to analyze
            instructions_text: Instructions extracted from context
            context_text: Context text extracted from context
            
        Returns:
            List of message dicts with role and content
            
        Raises:
            ValueError: If conversation is empty
        """
        if not conversation or not conversation.strip():
            raise ValueError("Conversation text is required for analysis")

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT}
        ]

        # Add instructions and context as user messages
        if instructions_text:
            messages.append({"role": "user", "content": instructions_text})
            
        if context_text:
            messages.append({"role": "user", "content": f"CONTEXT:\n{context_text}"})

        # Add transcript as final user message
        messages.append({"role": "user", "content": f"TRANSCRIPT:\n{conversation.strip()}"})
        
        return messages

    def build_request(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning_effort: Optional[str],
        verbosity: Optional[str],
        max_output_tokens: Optional[int],
        temperature: Optional[float],
        max_tokens: Optional[int],
        top_p: Optional[float]
    ) -> Dict[str, Any]:
        """Build a Chat Completions API request payload.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis
            model: Model name to use
            reasoning_effort: Reasoning effort (IGNORED - not supported by Chat Completions)
            verbosity: Verbosity level (IGNORED - not supported by Chat Completions)
            max_output_tokens: Not used (Chat Completions uses max_tokens instead)
            temperature: Sampling temperature (0.0-2.0), defaults to 0.7
            max_tokens: Maximum tokens to generate, defaults to 4000
            top_p: Nucleus sampling parameter (0.0-1.0), defaults to None
            
        Returns:
            Request payload dict with keys: model, messages, temperature, max_tokens, top_p (optional)
        """
        instructions_text, context_text = self._split_context_payload(context)
        messages = self._build_messages(conversation, instructions_text, context_text)

        # Chat Completions API does NOT support Responses API parameters
        if reasoning_effort is not None:
            logger.debug(
                "chat_completions_reasoning_ignored",
                reasoning_effort=reasoning_effort,
            )
        if verbosity is not None:
            logger.debug(
                "chat_completions_verbosity_ignored",
                verbosity=verbosity,
            )
        if max_output_tokens is not None:
            logger.debug(
                "chat_completions_max_output_tokens_ignored",
                max_output_tokens=max_output_tokens,
            )

        request_kwargs = {
            "model": model,
            "messages": messages,
        }
        
        # Only add optional parameters if provided
        if temperature is not None:
            request_kwargs["temperature"] = temperature
            logger.info("chat_completions_temperature_set", temperature=temperature)
        
        if max_tokens is not None:
            request_kwargs["max_tokens"] = max_tokens
            logger.info("chat_completions_max_tokens_set", max_tokens=max_tokens)
        
        if top_p is not None:
            request_kwargs["top_p"] = top_p
            logger.info("chat_completions_top_p_set", top_p=top_p)

        logger.debug(
            "chat_completions_request_built",
            request_keys=list(request_kwargs.keys()),
        )
        return request_kwargs

    def analyze(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning_effort: Optional[str] = None,
        verbosity: Optional[str] = None,
        max_output_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None
    ) -> str:
        """Analyze conversation using Chat Completions API.
        
        High-level method that builds request, calls API, and parses response.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis
            model: Model name to use
            reasoning_effort: Not used by Chat Completions (Responses API only)
            verbosity: Not used by Chat Completions (Responses API only)
            max_output_tokens: Not used by Chat Completions (Responses API only)
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter (0.0-1.0)
            
        Returns:
            Extracted analysis text
            
        Raises:
            AnalysisServiceError: If API call fails due to timeout or connection error
        """
        # Log all incoming parameters
        logger.info(
            "chat_completions_analysis_started",
            model=model,
            reasoning_effort=reasoning_effort,
            verbosity=verbosity,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        )
        
        request_kwargs = self.build_request(
            conversation, context, model, 
            reasoning_effort, verbosity, max_output_tokens,
            temperature, max_tokens, top_p
        )
        logger.info(
            "chat_completions_api_call_started",
            model=model,
            timeout_seconds=OPENAI_TIMEOUT_SECONDS,
        )
        
        try:
            response = self.client.chat.completions.create(**request_kwargs, timeout=OPENAI_TIMEOUT_SECONDS)
            return self.parse_response(response)
        except APITimeoutError as e:
            error_msg = f"Analysis timeout: OpenAI API call exceeded {OPENAI_TIMEOUT_SECONDS // 60} minute limit"
            logger.error(
                "chat_completions_api_timeout",
                message=error_msg,
                model=model,
                timeout_seconds=OPENAI_TIMEOUT_SECONDS,
            )
            raise AnalysisServiceError(error_msg) from e
        except APIConnectionError as e:
            error_msg = f"API connection failed: Unable to connect to OpenAI endpoint"
            logger.error(
                "chat_completions_api_connection_failed",
                message=error_msg,
                model=model,
                error=str(e),
            )
            raise AnalysisServiceError(error_msg) from e

    def parse_response(self, response: Any) -> str:
        """Parse Chat Completions API response and extract analysis text.
        
        Args:
            response: Raw API response from Chat Completions API
            
        Returns:
            Extracted analysis text
            
        Raises:
            ValueError: If response is missing content
        """
        # Extract text from response.choices[0].message.content
        if not hasattr(response, "choices") or not response.choices:
            logger.error("openai_response_choices_missing", response=str(response))
            raise ValueError("Missing choices in response from OpenAI")

        first_choice = response.choices[0]
        if not hasattr(first_choice, "message") or not hasattr(first_choice.message, "content"):
            logger.error("openai_response_message_content_missing", response=str(response))
            raise ValueError("Missing message content in response from OpenAI")

        analysis_text = first_choice.message.content
        if not analysis_text or not analysis_text.strip():
            logger.error("openai_response_message_content_empty", response=str(response))
            raise ValueError("Empty message content in response from OpenAI")

        return analysis_text

    def supports_reasoning(self) -> bool:
        """Check if this provider supports reasoning parameters.
        
        Returns:
            False (Chat Completions API does NOT support reasoning.effort)
        """
        return False

    def supports_verbosity(self) -> bool:
        """Check if this provider supports verbosity parameters.
        
        Returns:
            False (Chat Completions API does NOT support text.verbosity)
        """
        return False
