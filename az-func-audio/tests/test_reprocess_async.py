from unittest.mock import Mock, patch

from services.artifact_naming import (
    build_analysis_blob_name,
    is_reprocess_artifact,
    is_system_generated_file,
)
from services.reprocess_service import ReprocessService


def inference_catalog() -> dict:
    return {
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


def build_reprocess_service(cosmos_service: Mock):
    storage_service = Mock()
    storage_service.download_text_from_blob.return_value = "Transcribed text"
    storage_service.upload_text.return_value = (
        "https://storage.blob.core.windows.net/recordings/analysis.md"
    )
    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {
        "analysis_text": "Analysis output"
    }

    cosmos_service.get_prompts.return_value = "Summarise this meeting"
    cosmos_service.get_prompt_metadata.return_value = {}
    cosmos_service.get_inference_catalog.return_value = inference_catalog()

    service = ReprocessService(
        config_factory=lambda: Mock(storage_recordings_container="recordingscontainer"),
        storage_service_factory=lambda: storage_service,
        analysis_service_factory=lambda: analysis_service,
    )
    return service, storage_service, analysis_service


def original_job() -> dict:
    return {
        "id": "job-1",
        "file_path": "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        "transcription_file_path": "https://storage.blob.core.windows.net/recordings/test/transcript.txt",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
        "status": "completed",
    }


def test_operation_id_makes_the_analysis_artifact_name_deterministic():
    operation_id = "12345678-1234-5678-1234-567812345678"

    first = build_analysis_blob_name(
        "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        operation_id=operation_id,
    )
    second = build_analysis_blob_name(
        "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        operation_id=operation_id,
    )

    assert first == second
    assert first == "test/audio__SYS___reprocess_operation_1234567812345678.md"


def test_generated_artifact_detection_remains_compatible():
    artifact = "test/audio__SYS___reprocess_operation_1234567812345678.md"
    assert is_system_generated_file(artifact)
    assert is_reprocess_artifact(artifact)
    assert not is_reprocess_artifact("test/audio.mp3")


@patch("services.cosmos_service.CosmosService")
def test_reprocess_commits_against_the_latest_job_document(cosmos_class):
    cosmos_service = Mock()
    cosmos_service.get_job_by_id.return_value = original_job()
    cosmos_service.commit_reprocess_result.return_value = (
        {"id": "job-1", "status": "completed"},
        2,
    )
    cosmos_class.return_value = cosmos_service
    service, storage_service, _ = build_reprocess_service(cosmos_service)

    response = service.reprocess(
        {"job_id": "job-1", "instructions": "Focus on decisions"},
        correlation_id="operation-1",
        operation_id="operation-1",
    )

    assert response.status_code == 200
    assert response.payload["attempt_number"] == 2
    uploaded_blob_name = storage_service.upload_text.call_args.args[1]
    assert uploaded_blob_name.endswith(
        "audio__SYS___reprocess_operation_operation1.md"
    )
    commit = cosmos_service.commit_reprocess_result.call_args
    assert commit.args == ("job-1",)
    assert commit.kwargs["analysis_attempt"]["reprocess_operation_id"] == "operation-1"


@patch("services.cosmos_service.CosmosService")
def test_create_new_job_uses_a_stable_id_and_completes_the_original(cosmos_class):
    cosmos_service = Mock()
    cosmos_service.get_job_by_id.return_value = original_job()
    cosmos_service.create_job_if_missing.side_effect = lambda job: job
    cosmos_service.commit_reprocess_result.side_effect = lambda job_id, **kwargs: (
        {"id": job_id, "status": "completed"},
        1,
    )
    cosmos_class.return_value = cosmos_service
    service, _, _ = build_reprocess_service(cosmos_service)

    first = service.reprocess(
        {"job_id": "job-1", "create_new_job": True},
        correlation_id="operation-2",
        operation_id="operation-2",
    )
    second = service.reprocess(
        {"job_id": "job-1", "create_new_job": True},
        correlation_id="operation-2",
        operation_id="operation-2",
    )

    assert first.payload["job_id"] == second.payload["job_id"]
    assert first.payload["job_id"] != "job-1"
    completion_calls = [
        call
        for call in cosmos_service.update_job_status.call_args_list
        if call.args[:2] == ("job-1", "completed")
    ]
    assert len(completion_calls) == 2
    assert all(call.kwargs["analysis_in_progress"] is False for call in completion_calls)
