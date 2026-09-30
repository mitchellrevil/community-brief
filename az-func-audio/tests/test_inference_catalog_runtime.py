from datetime import UTC, datetime, timedelta

import pytest

from agent.activation import should_use_template_agent_workflow
from services.analysis_workflow import get_prompt_inference_settings
from services.cosmos_service import CosmosService, CosmosServiceError


class FakeLogger:
    def info(self, *_args, **_kwargs):
        pass


class FakeCosmos:
    def __init__(self, prompt, model_status="active"):
        self.prompt = prompt
        self.catalog = {
            "version": 3,
            "default_model": "gpt-5.4",
            "models": [
                {
                    "key": "gpt-5.4",
                    "display_name": "GPT-5.4",
                    "deployment": "gpt-5.4-prod",
                    "provider": "responses",
                    "status": model_status,
                    "retires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
                    "parameters": {
                        "reasoning_effort": {"default": "none"},
                        "temperature": {
                            "depends_on": {
                                "parameter": "reasoning_effort",
                                "value": "none",
                            }
                        },
                    },
                }
            ],
        }

    def get_prompt_metadata(self, _prompt_id):
        return self.prompt

    def get_inference_catalog(self):
        return self.catalog


def test_runtime_resolves_catalog_default_to_deployment():
    _, settings = get_prompt_inference_settings(
        FakeCosmos({"provider_parameters": {"temperature": 0.5}}),
        "prompt-1",
        correlation_id="c",
        job_id="j",
        logger=FakeLogger(),
    )
    assert settings["analysis_model_key"] == "gpt-5.4"
    assert settings["analysis_model"] == "gpt-5.4-prod"
    assert settings["catalog_version"] == 3


def test_runtime_rejects_disabled_model():
    with pytest.raises(ValueError, match="disabled"):
        get_prompt_inference_settings(
            FakeCosmos({}, model_status="disabled"),
            "prompt-1",
            correlation_id="c",
            job_id="j",
            logger=FakeLogger(),
        )


def test_workflow_activation_is_explicit():
    assert should_use_template_agent_workflow(
        {"analysis_workflow": "structured_review"}
    )
    assert not should_use_template_agent_workflow(
        {"provider_parameters": {"reasoning_effort": "high"}}
    )


class FakeCatalogContainer:
    def __init__(self, value):
        self.value = value

    def read_item(self, **_kwargs):
        if isinstance(self.value, Exception):
            raise self.value
        return self.value


def test_catalog_failure_blocks_analysis_even_after_successful_read():
    service = CosmosService.__new__(CosmosService)
    service.prompts_container = FakeCatalogContainer(FakeCosmos({}).catalog)

    service.get_inference_catalog()
    service.prompts_container.value = ValueError("temporary failure")

    with pytest.raises(CosmosServiceError, match="analysis cannot start"):
        service.get_inference_catalog()


def test_catalog_fails_without_valid_catalog():
    service = CosmosService.__new__(CosmosService)
    service.prompts_container = FakeCatalogContainer(ValueError("missing"))

    with pytest.raises(CosmosServiceError, match="analysis cannot start"):
        service.get_inference_catalog()


def test_warm_worker_reads_retirement_before_next_job():
    service = CosmosService.__new__(CosmosService)
    service.prompts_container = FakeCatalogContainer(FakeCosmos({}).catalog)
    assert service.get_inference_catalog()["models"][0]["status"] == "active"
    service.prompts_container.value = FakeCosmos({}, model_status="retired").catalog
    service.get_prompt_metadata = lambda _: {}
    with pytest.raises(ValueError, match="retired"):
        get_prompt_inference_settings(
            service, "prompt-1", correlation_id="c", job_id="j", logger=FakeLogger()
        )
