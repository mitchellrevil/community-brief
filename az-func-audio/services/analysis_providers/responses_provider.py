"""
ResponsesProvider: Analysis provider using Azure OpenAI Responses API.

This provider implements the AnalysisProvider Protocol using the Responses API,
which supports advanced features like reasoning.effort and text.verbosity for
compatible models.
"""

from typing import Dict, Any, Optional, Callable
import json
import structlog
from openai import OpenAI, APITimeoutError, APIConnectionError
from openai.types.responses import ResponseInputParam
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
    "STRUCTURE: Adapt based on context. but (GFM) constructs such as tables, task lists and strikethrough are supported. "
)

# Models that support reasoning.effort parameter
REASONING_CAPABLE_MODELS = {"gpt-5.5-sweden", "gpt-5.4", "gpt-5.1", "gpt-5-mini", "gpt-5-nano"}

# Models that support text.verbosity parameter
VERBOSITY_CAPABLE_MODELS = {"gpt-5.5-sweden", "gpt-5.4", "gpt-5.1", "gpt-5-mini", "gpt-5-nano"}

# Models that only accept sampling parameters when reasoning is disabled.
NONE_REASONING_SAMPLING_MODELS = {"gpt-5.5-sweden", "gpt-5.4"}


class ResponsesProvider:
    """Analysis provider using Azure OpenAI Responses API.
    
    Implements AnalysisProvider Protocol for Responses API backend.
    Supports reasoning.effort and text.verbosity parameters for compatible models.
    """

    def __init__(self, config: AppConfig, credential: Any = None) -> None:
        """Initialize ResponsesProvider.
        
        Args:
            config: Application configuration
            credential: Optional Azure credential (uses DefaultAzureCredential if None)
        """
        self.config = config
        self.credential = credential
        self.client = self._build_client()

    def _build_client(self) -> OpenAI:
        """Create an OpenAI client configured for the Responses API."""
        endpoint = (self.config.azure_openai_endpoint or "").rstrip("/")
        if not endpoint:
            raise ValueError("Azure OpenAI endpoint is not configured")
        
        base_url = endpoint if endpoint.endswith("/openai/v1") else f"{endpoint}/openai/v1"

        api_key = getattr(self.config, "azure_openai_api_key", None)
        if api_key:
            logger.info("responses_provider_auth_selected", auth_method="api_key")
            return OpenAI(base_url=base_url, api_key=api_key)

        credential = self.credential
        if credential is None:
            try:
                from azure.identity import DefaultAzureCredential
                credential = DefaultAzureCredential()
            except PROVIDER_IMPORT_ERRORS as exc:
                raise ValueError("Managed identity authentication requires azure.identity") from exc

        logger.info("responses_provider_auth_selected", auth_method="managed_identity")
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

    def _build_response_input(
        self, conversation: str, context_text: str
    ) -> ResponseInputParam:
        """Create the response input including the base prompt and user content.
        
        Args:
            conversation: Conversation text to analyze
            context_text: Additional context text
            
        Returns:
            ResponseInputParam messages array
            
        Raises:
            ValueError: If conversation is empty
        """
        if not conversation or not conversation.strip():
            raise ValueError("Conversation text is required for analysis")

        messages: ResponseInputParam = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT}
        ]

        if context_text:
            messages.append({"role": "user", "content": f"CONTEXT:\n{context_text}"})

        messages.append({"role": "user", "content": f"TRANSCRIPT:\n{conversation.strip()}"})
        return messages

    def _can_include_sampling_parameters(
        self,
        model: str,
        reasoning_effort: Optional[str],
    ) -> bool:
        """Return whether temperature/top_p can be sent for the current model."""
        if model not in NONE_REASONING_SAMPLING_MODELS:
            return True

        return reasoning_effort in (None, "none")

    def build_request(
        self,
        conversation: str,
        context: Any,
        model: str,
        reasoning_effort: Optional[str],
        verbosity: Optional[str],
        max_output_tokens: Optional[int],
        temperature: Optional[float],
        top_p: Optional[float]
    ) -> Dict[str, Any]:
        """Build a Responses API request payload.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis
            model: Model name to use
            reasoning_effort: Reasoning effort level ("none", "low", "medium", "high", "xhigh") or None
            verbosity: Verbosity level ("auto", "low", "medium", "high", "detailed") or None
            max_output_tokens: Maximum output tokens or None
            temperature: Sampling temperature (0.0-2.0) or None
                        NOTE: For gpt-5.4, only supported when reasoning_effort is "none"
            top_p: Nucleus sampling parameter (0.0-1.0) or None
            
        Returns:
            Request payload dict with keys: model, input, reasoning (optional), 
            instructions (optional), text (optional), max_output_tokens (optional),
            temperature (optional), top_p (optional)
        """
        instructions_text, context_text = self._split_context_payload(context)
        input_messages = self._build_response_input(conversation, context_text)

        request_kwargs = {
            "model": model,
            "input": input_messages,
        }

        # Apply reasoning settings if supported by model
        model_supports_reasoning = model in REASONING_CAPABLE_MODELS
        if reasoning_effort is not None and model_supports_reasoning:
            # API expects reasoning as an object with "effort" key
            request_kwargs["reasoning"] = {"effort": reasoning_effort}
            logger.info("responses_reasoning_enabled", reasoning_effort=reasoning_effort)
        elif reasoning_effort is not None and not model_supports_reasoning:
            logger.warning(
                "responses_reasoning_ignored",
                model=model,
                reasoning_effort=reasoning_effort,
                reason="model_not_supported",
            )

        # Apply verbosity settings if supported by model
        model_supports_verbosity = model in VERBOSITY_CAPABLE_MODELS
        if verbosity is not None and model_supports_verbosity:
            # API expects text as an object with "verbosity" key
            request_kwargs["text"] = {"verbosity": verbosity}
            logger.info("responses_verbosity_enabled", verbosity=verbosity)
        elif verbosity is not None and not model_supports_verbosity:
            logger.warning(
                "responses_verbosity_ignored",
                model=model,
                verbosity=verbosity,
                reason="model_not_supported",
            )

        # Apply max_output_tokens if provided
        if max_output_tokens is not None:
            request_kwargs["max_output_tokens"] = max_output_tokens
            logger.info("responses_max_output_tokens_set", max_output_tokens=max_output_tokens)

        # Apply temperature if provided
        # NOTE: For gpt-5.1 models, temperature is only supported when reasoning_effort is "none"
        # Other reasoning levels will cause a 400 error if temperature is provided
        if temperature is not None and self._can_include_sampling_parameters(model, reasoning_effort):
            request_kwargs["temperature"] = temperature
            logger.info("responses_temperature_set", temperature=temperature)
        elif temperature is not None:
            logger.warning(
                "responses_temperature_ignored",
                model=model,
                reasoning_effort=reasoning_effort,
                reason="reasoning_requires_no_sampling",
            )

        # Apply top_p if provided
        if top_p is not None and self._can_include_sampling_parameters(model, reasoning_effort):
            request_kwargs["top_p"] = top_p
            logger.info("responses_top_p_set", top_p=top_p)
        elif top_p is not None:
            logger.warning(
                "responses_top_p_ignored",
                model=model,
                reasoning_effort=reasoning_effort,
                reason="reasoning_requires_no_sampling",
            )

        # Only add instructions if we have non-empty text
        if instructions_text and instructions_text.strip():
            request_kwargs["instructions"] = instructions_text

        logger.debug(
            "responses_request_built",
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
        """Analyze conversation using Responses API.
        
        High-level method that builds request, calls API, and parses response.
        
        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis
            model: Model name to use
            reasoning_effort: Reasoning effort level ("none", "low", "medium", "high", "xhigh") or None
            verbosity: Verbosity level ("auto", "low", "medium", "high", "detailed") or None
            max_output_tokens: Maximum output tokens or None
            temperature: Sampling temperature (0.0-2.0) or None
                        NOTE: For gpt-5.4, temperature is only supported when 
                        reasoning_effort is "none". Using temperature with other reasoning 
                        levels will result in a 400 error.
            max_tokens: Not used by Responses API (Chat Completions only)
            top_p: Nucleus sampling parameter (0.0-1.0) or None
            
        Returns:
            Extracted analysis text
            
        Raises:
            AnalysisServiceError: If API call fails due to timeout or connection error
        """
        # Log all incoming parameters
        logger.info(
            "responses_analysis_started",
            model=model,
            reasoning_effort=reasoning_effort,
            verbosity=verbosity,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        )
        
        # Warn if Chat Completions-only parameters are provided
        if max_tokens is not None:
            logger.debug("responses_max_tokens_ignored", max_tokens=max_tokens)
        
        request_kwargs = self.build_request(conversation, context, model, reasoning_effort, verbosity, max_output_tokens, temperature, top_p)
        logger.info(
            "responses_api_call_started",
            model=model,
            timeout_seconds=OPENAI_TIMEOUT_SECONDS,
        )
        
        try:
            response = self.client.responses.create(**request_kwargs, timeout=OPENAI_TIMEOUT_SECONDS)
            return response.output_text
        except APITimeoutError as e:
            error_msg = f"Analysis timeout: OpenAI API call exceeded {OPENAI_TIMEOUT_SECONDS // 60} minute limit"
            logger.error(
                "responses_api_timeout",
                message=error_msg,
                model=model,
                timeout_seconds=OPENAI_TIMEOUT_SECONDS,
            )
            raise AnalysisServiceError(error_msg) from e
        except APIConnectionError as e:
            error_msg = f"API connection failed: Unable to connect to OpenAI endpoint"
            logger.error(
                "responses_api_connection_failed",
                message=error_msg,
                model=model,
                error=str(e),
            )
            raise AnalysisServiceError(error_msg) from e

   

    def supports_reasoning(self) -> bool:
        """Check if this provider supports reasoning parameters.
        
        Returns:
            True (Responses API supports reasoning.effort)
        """
        return True

    def supports_verbosity(self) -> bool:
        """Check if this provider supports verbosity parameters.
        
        Returns:
            True (Responses API supports text.verbosity)
        """
        return True
