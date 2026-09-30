from typing import Dict, Any, Optional
from config import AppConfig
from core.logging import get_logger
from services.interfaces import ProviderAnalysisRequest

logger = get_logger(__name__)

ANALYSIS_SERVICE_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)

# Sentinel value to distinguish between None (explicitly disable) and not provided
_UNSET = object()


class AnalysisServiceError(Exception):
    """Custom exception for analysis service errors."""

    pass


class AnalysisService:
    """Orchestrator service for analysis providers.

    Delegates analysis requests to pluggable provider implementations
    (Responses API, Chat Completions API, etc.) based on configuration.
    """

    def __init__(
        self,
        config: AppConfig,
        credential: Any = None,
        provider_registry: Optional[Dict] = None,
    ) -> None:
        """Initialize the AnalysisService.

        Args:
            config: Application configuration
            credential: Optional Azure credential (providers will use DefaultAzureCredential if None)
            provider_registry: Optional mapping of provider names to provider classes
                              If None, uses default registry from dependencies
        """
        self.config = config
        self.credential = credential

        # Use provided registry or get default
        if provider_registry is not None:
            self.provider_registry = provider_registry
        else:
            from services.analysis_provider_registry import (
                get_analysis_provider_registry,
            )

            self.provider_registry = get_analysis_provider_registry()
        self._providers: Dict[str, Any] = {}

    def _get_provider(self, provider_name: Optional[str]):
        """Get the appropriate analysis provider instance.

        Args:
            provider_name: Name of provider to use ("responses", "chat_completions")
                          If None, uses config default

        Returns:
            Provider instance implementing AnalysisProvider Protocol

        Raises:
            ValueError: If provider_name is invalid
        """
        # Determine which provider to use (explicit arg or config default)
        provider_name = provider_name or self.config.default_analysis_provider

        # Look up provider class in registry
        provider_class = self.provider_registry.get(provider_name)

        if provider_class is None:
            supported = ", ".join(self.provider_registry.keys())
            raise ValueError(
                f"Unknown analysis provider: {provider_name}. "
                f"Allowed values: {supported}"
            )

        if provider_name not in self._providers:
            self._providers[provider_name] = provider_class(
                config=self.config, credential=self.credential
            )
        return self._providers[provider_name]

    def get_supported_providers(self) -> list:
        """Get list of supported provider names.

        Returns:
            List of provider name strings available in the registry
        """
        return list(self.provider_registry.keys())

    def analyze_conversation(
        self,
        conversation: str,
        context: Any,
        analysis_model: Optional[str] = None,
        analysis_reasoning: Optional[str] = _UNSET,  # Use sentinel to detect omission
        analysis_verbosity: Optional[str] = None,
        provider_name: Optional[str] = None,
        provider_parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Analyze conversation using configured provider and return analysis results.

        Args:
            conversation: The conversation text to analyze
            context: Additional context for analysis
            analysis_model: Model to use (overrides config default)
            analysis_reasoning: Reasoning effort level ("low", "medium", "high", or None to disable)
                              If omitted, uses config default
            analysis_verbosity: Verbosity level for output ("concise", "detailed", etc.)
                              If provided, included in request (provider determines support)
            provider_name: Analysis provider to use ("responses", "chat_completions", etc.)
                          If None, uses config default
            provider_parameters: Catalogue defaults merged with explicit template overrides.
                               Supports JSON request arguments without a model-name allowlist.
                               Only None falls back to legacy arguments/configuration; an empty
                               dictionary intentionally sends no optional model arguments.

        Returns:
            Dict with analysis_text, raw_response, and status
        """
        provider = self._get_provider(provider_name)
        provider_type = provider.__class__.__name__
        logger.info(
            "analysis_provider_selected",
            provider_type=provider_type,
            requested_provider=provider_name,
        )

        try:
            # Ensure model is a string (fallback if corrupted data in Cosmos)
            if isinstance(analysis_model, str) and analysis_model.strip():
                model = analysis_model
            else:
                if analysis_model is not None:
                    logger.warning(
                        "analysis_model_invalid",
                        expected_type="str",
                        actual_type=type(analysis_model).__name__,
                        value=analysis_model,
                    )
                model = self.config.azure_openai_deployment
                if not isinstance(model, str) or not model.strip():
                    raise ValueError(
                        f"Invalid model configuration: expected string, got {type(model).__name__}"
                    )

            if provider_parameters is not None:
                parameters = dict(provider_parameters)
            else:
                reasoning = analysis_reasoning
                if reasoning is _UNSET:
                    reasoning = (
                        self.config.reasoning_level
                        if self.config.enable_reasoning
                        else None
                    )
                parameters = {
                    key: value
                    for key, value in {
                        "reasoning_effort": reasoning,
                        "verbosity": analysis_verbosity,
                    }.items()
                    if value is not None
                }
            from services.model_options import validate_options

            validate_options(parameters)
            logger.info(
                "analysis_provider_call_started",
                provider_type=provider_type,
                model=model,
                parameter_names=sorted(parameters),
            )
            analysis_text = provider.analyze(
                ProviderAnalysisRequest(
                    conversation=conversation,
                    context=context,
                    deployment=model,
                    parameters=parameters,
                )
            )

            return {
                "analysis_text": analysis_text,
                "status": "success",
            }
        except ANALYSIS_SERVICE_ERRORS as e:
            logger.error(
                "analysis_provider_call_failed",
                provider_type=provider_type,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise AnalysisServiceError(f"Analysis failed: {str(e)}") from e

    def process_transcription_results(
        self, transcription_result: Dict[str, Any], context: str
    ) -> Dict[str, Any]:
        """Process transcription results and perform analysis."""
        try:
            # Extract conversation text from transcription
            conversation_text = transcription_result.get(
                "combinedRecognizedPhrases", [{}]
            )[0].get("display", "")
            if not conversation_text:
                raise ValueError("No conversation text found in transcription results")

            # Perform analysis
            analysis_result = self.analyze_conversation(conversation_text, context)

            return {
                "transcription": conversation_text,
                "analysis": analysis_result,
                "status": "success",
            }

        except ANALYSIS_SERVICE_ERRORS as e:
            logger.error(
                "analysis_transcription_results_failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise AnalysisServiceError(
                f"Failed to process transcription results: {str(e)}"
            ) from e
