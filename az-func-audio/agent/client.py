from __future__ import annotations

from typing import Any

from .instructions import (
    EVIDENCE_MAPPER_INSTRUCTIONS,
    QA_INSTRUCTIONS,
    WRITER_INSTRUCTIONS,
)


def build_template_agents(
    config: Any, inference_settings: dict[str, Any] | None = None
) -> dict[str, Any]:
    try:
        from agent_framework.openai import OpenAIChatClient, OpenAIChatCompletionClient
    except (ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(
            "Microsoft Agent Framework OpenAI integration is not installed"
        ) from exc

    base_endpoint = (config.azure_openai_endpoint or "").rstrip("/")
    if not base_endpoint:
        raise RuntimeError("Azure OpenAI endpoint is required for template agents")

    base_url = (
        base_endpoint
        if base_endpoint.endswith("/openai/v1")
        else f"{base_endpoint}/openai/v1"
    )
    api_key = getattr(config, "azure_openai_api_key", None)
    settings = inference_settings or {}
    provider = settings.get("provider_name", "responses")
    client_type = (
        OpenAIChatClient if provider == "responses" else OpenAIChatCompletionClient
    )
    deployment = settings.get("analysis_model") or config.azure_openai_deployment
    if api_key:
        client = client_type(
            model=deployment,
            api_key=api_key,
            base_url=base_url,
        )
    else:
        try:
            from azure.identity import DefaultAzureCredential
        except (ImportError, ModuleNotFoundError) as exc:
            raise RuntimeError(
                "Managed identity template agents require azure.identity"
            ) from exc

        client = client_type(
            model=deployment,
            credential=DefaultAzureCredential(),
            azure_endpoint=base_endpoint,
            api_version=getattr(config, "azure_openai_version", None),
        )

    from services.model_options import provider_request_options

    request_options = provider_request_options(
        settings.get("provider_parameters") or {}, provider
    )
    body = request_options.pop("extra_body", {})
    body.update(request_options)
    # extra_body preserves new provider fields across Agent Framework/SDK versions.
    options = (
        {"extra_body": body} if inference_settings is not None else {"max_tokens": 4000}
    )
    return {
        "evidence": client.as_agent(
            id="evidence_mapper",
            name="CommunityBriefEvidenceMapper",
            instructions=EVIDENCE_MAPPER_INSTRUCTIONS,
            default_options=options,
        ),
        "writer": client.as_agent(
            id="template_writer",
            name="CommunityBriefTemplateWriter",
            instructions=WRITER_INSTRUCTIONS,
            default_options=options,
        ),
        "qa": client.as_agent(
            id="template_qa",
            name="CommunityBriefTemplateQA",
            instructions=QA_INSTRUCTIONS,
            default_options=options,
        ),
    }
