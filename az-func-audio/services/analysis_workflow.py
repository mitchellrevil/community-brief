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
    prompt_metadata = cosmos_service.get_prompt_metadata(prompt_subcategory_id) or {}
    catalog = cosmos_service.get_inference_catalog()
    model_key = prompt_metadata.get("analysis_model") or catalog.get("default_model")
    model = next(
        (item for item in catalog.get("models", []) if item.get("key") == model_key),
        None,
    )
    if not model:
        raise ValueError(
            f'Analysis model "{model_key}" is not in the inference catalog'
        )

    status = model.get("status", "active")
    retires_at = model.get("retires_at")
    if retires_at:
        from datetime import UTC, datetime

        if datetime.fromisoformat(retires_at.replace("Z", "+00:00")) <= datetime.now(
            UTC
        ):
            status = "retired"
    if status in {"disabled", "retired"}:
        raise ValueError(f'Analysis model "{model_key}" is {status}')

    provider = model.get("provider")
    stored_provider = prompt_metadata.get("analysis_provider")
    if stored_provider and stored_provider != provider:
        raise ValueError(
            f'Provider "{stored_provider}" does not match catalog provider "{provider}"'
        )
    from services.model_options import resolve_model_options

    parameters = resolve_model_options(
        model, dict(prompt_metadata.get("provider_parameters") or {})
    )

    settings = {
        "analysis_model": model.get("deployment") or model_key,
        "analysis_model_key": model_key,
        "analysis_reasoning": prompt_metadata.get("analysis_reasoning"),
        "analysis_verbosity": prompt_metadata.get("analysis_verbosity"),
        "analysis_provider": provider,
        "provider_parameters": parameters,
        "analysis_workflow": prompt_metadata.get("analysis_workflow", "standard"),
        "catalog_version": catalog.get("version"),
    }
    logger.info(
        f"{log_prefix}prompt_inference_settings.retrieved",
        correlation_id=correlation_id,
        job_id=job_id,
        prompt_subcategory_id=prompt_subcategory_id,
        analysis_model_key=model_key,
        analysis_deployment=settings["analysis_model"],
        analysis_provider=provider,
        analysis_workflow=settings["analysis_workflow"],
        catalog_version=settings["catalog_version"],
        lifecycle_status=status,
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
