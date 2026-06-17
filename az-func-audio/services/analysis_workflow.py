from __future__ import annotations

from typing import Any, Dict, Optional

ANALYSIS_WORKFLOW_ERRORS = (RuntimeError, ValueError, TypeError, KeyError)


def get_prompt_inference_settings(
    cosmos_service,
    prompt_subcategory_id: str,
    *,
    correlation_id: str,
    job_id: str,
    logger: Any,
    log_prefix: str = "",
) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt_metadata: dict[str, Any] = {}
    settings = {
        "analysis_model": None,
        "analysis_reasoning": None,
        "analysis_verbosity": None,
        "analysis_provider": None,
        "provider_parameters": None,
    }

    try:
        prompt_metadata = cosmos_service.get_prompt_metadata(prompt_subcategory_id) or {}
        settings.update(
            {
                "analysis_model": prompt_metadata.get("analysis_model"),
                "analysis_reasoning": prompt_metadata.get("analysis_reasoning"),
                "analysis_verbosity": prompt_metadata.get("analysis_verbosity"),
                "analysis_provider": prompt_metadata.get("analysis_provider"),
                "provider_parameters": prompt_metadata.get("provider_parameters"),
            }
        )
        retrieved_event = f"{log_prefix}prompt_inference_settings.retrieved"
        logger.info(
            retrieved_event,
            correlation_id=correlation_id,
            job_id=job_id,
            prompt_subcategory_id=prompt_subcategory_id,
            analysis_model=settings["analysis_model"] or "using config default",
            analysis_reasoning=(
                settings["analysis_reasoning"]
                if "analysis_reasoning" in prompt_metadata
                else "using config default"
            ),
            analysis_verbosity=settings["analysis_verbosity"] or "using config default",
            analysis_provider=settings["analysis_provider"] or "using config default",
            provider_parameters=settings["provider_parameters"] or "none",
        )
    except ANALYSIS_WORKFLOW_ERRORS:
        fallback_event = f"{log_prefix}prompt_inference_settings.fallback_to_config"
        logger.warning(
            fallback_event,
            correlation_id=correlation_id,
            job_id=job_id,
            prompt_subcategory_id=prompt_subcategory_id,
            exc_info=True,
        )

    return prompt_metadata, settings


def build_analysis_kwargs(
    *,
    conversation: str,
    context: Dict[str, Any],
    prompt_metadata: Dict[str, Any],
    settings: Dict[str, Any],
) -> Dict[str, Any]:
    analysis_kwargs: Dict[str, Any] = {
        "conversation": conversation,
        "context": context,
    }

    if settings["analysis_model"] is not None:
        analysis_kwargs["analysis_model"] = settings["analysis_model"]
    if "analysis_reasoning" in prompt_metadata:
        analysis_kwargs["analysis_reasoning"] = settings["analysis_reasoning"]
    if settings["analysis_verbosity"] is not None:
        analysis_kwargs["analysis_verbosity"] = settings["analysis_verbosity"]
    if settings["analysis_provider"] is not None:
        analysis_kwargs["provider_name"] = settings["analysis_provider"]
    if settings["provider_parameters"] is not None:
        analysis_kwargs["provider_parameters"] = settings["provider_parameters"]

    return analysis_kwargs


def safe_get_prompt_text(
    cosmos_service,
    subcategory_id: Optional[str],
    *,
    correlation_id: str,
    job_id: str,
    logger: Any,
) -> Optional[str]:
    if not subcategory_id:
        return None

    try:
        return cosmos_service.get_prompts(subcategory_id)
    except ANALYSIS_WORKFLOW_ERRORS:
        logger.warning(
            "prompt_text.lookup_failed",
            correlation_id=correlation_id,
            job_id=job_id,
            subcategory_id=subcategory_id,
            exc_info=True,
        )
        return None


def build_ai_context(
    *,
    user_prompt: Optional[str],
    base_prompt: Optional[str] = None,
    instructions: Optional[str] = None,
    session_data: Optional[Any] = None,
    extra_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    context: Dict[str, Any] = {}
    if base_prompt:
        context["base_prompt"] = base_prompt
    if user_prompt:
        context["user_prompt"] = user_prompt
    if instructions:
        context["instructions"] = instructions
    if session_data:
        context["session_data"] = session_data
    if extra_context:
        context.update(extra_context)
    return context
