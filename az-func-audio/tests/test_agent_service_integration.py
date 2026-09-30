from unittest.mock import Mock

import pytest

from services.blob_processing_service import BlobProcessingService
from services.reprocess_service import ReprocessService


@pytest.mark.asyncio
async def test_blob_analysis_routes_enhanced_prompt_to_agent(monkeypatch, app_config):
    async def fake_workflow(**_kwargs):
        result = Mock()
        result.analysis_text = "# Agent analysis"
        result.revision_count = 0
        return result

    monkeypatch.setattr("services.blob_processing_service.run_meeting_template_workflow", fake_workflow)
    analysis_service = Mock()
    service = BlobProcessingService(
        storage_service_factory=Mock(),
        transcription_service_factory=Mock(),
        analysis_service_factory=Mock(),
    )

    result = await service.analyze_content(
        formatted_text="Transcript",
        prompt_text="# Template",
        prompt_metadata={
            "analysis_reasoning": "high",
            "analysis_workflow": "structured_review",
        },
        config=app_config,
        cosmos_service=Mock(),
        analysis_service=analysis_service,
        analysis_kwargs={"conversation": "Transcript", "context": {}},
        session_data={"chair": "A"},
        job_id="job-1",
        correlation_id="corr-1",
    )

    assert result == {"analysis_text": "# Agent analysis"}
    analysis_service.analyze_conversation.assert_not_called()


@pytest.mark.asyncio
async def test_blob_analysis_uses_legacy_service_for_normal_prompt(app_config):
    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "# Legacy"}
    service = BlobProcessingService(
        storage_service_factory=Mock(),
        transcription_service_factory=Mock(),
        analysis_service_factory=Mock(),
    )

    result = await service.analyze_content(
        formatted_text="Transcript",
        prompt_text="# Template",
        prompt_metadata={"analysis_reasoning": "medium"},
        config=app_config,
        cosmos_service=Mock(),
        analysis_service=analysis_service,
        analysis_kwargs={"conversation": "Transcript", "context": {}},
        job_id="job-1",
        correlation_id="corr-1",
    )

    assert result == {"analysis_text": "# Legacy"}
    analysis_service.analyze_conversation.assert_called_once()


def test_reprocess_routes_enhanced_prompt_to_agent(monkeypatch, app_config):
    monkeypatch.setattr(
        "services.reprocess_service.run_meeting_template_workflow_sync",
        lambda **_kwargs: Mock(analysis_text="# Agent reprocess", revision_count=0),
    )

    cosmos = Mock()
    cosmos.get_job_by_id.return_value = {
        "id": "job-1",
        "text_content": "Transcript",
        "prompt_category_id": "cat-1",
        "prompt_subcategory_id": "prompt-1",
        "file_path": "recordings/input.txt",
    }
    cosmos.get_prompts.return_value = "# Template"
    cosmos.get_prompt_metadata.return_value = {
        "analysis_reasoning": "high",
        "analysis_workflow": "structured_review",
        "prompts": {"default": "# Template"},
    }
    cosmos.get_inference_catalog.return_value = {
        "version": "test",
        "default_model": "default",
        "models": [
            {
                "key": "default",
                "deployment": "gpt-test",
                "provider": "responses",
                "parameters": {},
            }
        ],
    }
    cosmos.commit_reprocess_result.return_value = ({"id": "job-1"}, 1)

    storage = Mock()
    storage.upload_text.return_value = "https://storage/analysis.md"
    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "# Legacy"}

    monkeypatch.setattr("services.cosmos_service.CosmosService", Mock(return_value=cosmos))
    service = ReprocessService(
        config_factory=lambda: app_config,
        storage_service_factory=lambda: storage,
        analysis_service_factory=lambda: analysis_service,
    )

    response = service.reprocess({"job_id": "job-1"}, correlation_id="corr-1")

    assert response.status_code == 200
    analysis_service.analyze_conversation.assert_not_called()
    storage.upload_text.assert_called_once()
    assert storage.upload_text.call_args.args[2] == "# Agent reprocess"


def test_reprocess_uses_legacy_service_for_normal_prompt(monkeypatch, app_config):
    cosmos = Mock()
    cosmos.get_job_by_id.return_value = {
        "id": "job-1",
        "text_content": "Transcript",
        "prompt_category_id": "cat-1",
        "prompt_subcategory_id": "prompt-1",
        "file_path": "recordings/input.txt",
    }
    cosmos.get_prompts.return_value = "# Template"
    cosmos.get_prompt_metadata.return_value = {
        "analysis_reasoning": "medium",
        "prompts": {"default": "# Template"},
    }
    cosmos.get_inference_catalog.return_value = {
        "version": "test",
        "default_model": "default",
        "models": [
            {
                "key": "default",
                "deployment": "gpt-test",
                "provider": "responses",
                "parameters": {},
            }
        ],
    }
    cosmos.commit_reprocess_result.return_value = ({"id": "job-1"}, 1)

    storage = Mock()
    storage.upload_text.return_value = "https://storage/analysis.md"
    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "# Legacy"}

    monkeypatch.setattr("services.cosmos_service.CosmosService", Mock(return_value=cosmos))
    service = ReprocessService(
        config_factory=lambda: app_config,
        storage_service_factory=lambda: storage,
        analysis_service_factory=lambda: analysis_service,
    )

    response = service.reprocess({"job_id": "job-1"}, correlation_id="corr-1")

    assert response.status_code == 200
    analysis_service.analyze_conversation.assert_called_once()
    assert storage.upload_text.call_args.args[2] == "# Legacy"
