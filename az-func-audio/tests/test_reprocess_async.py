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


@patch("services.cosmos_service.CosmosService")
def test_reprocessed_clone_keeps_teams_source_and_owns_its_enriched_transcript(cosmos_class):
    cosmos_service = Mock()
    job = {**original_job(), "source": {"kind": "teams", "event_id": "event-1"}, "teams_event_id": "event-1", "pre_session_form_data": {"chair": "Jane"}}
    cosmos_service.get_job_by_id.return_value = job
    cosmos_service.create_job_if_missing.side_effect = lambda target: target
    cosmos_service.commit_reprocess_result.side_effect = lambda job_id, **kwargs: ({"id": job_id, **kwargs["job_updates"]}, 1)
    cosmos_class.return_value = cosmos_service
    service, storage, analysis = build_reprocess_service(cosmos_service)
    cosmos_service.get_prompt_metadata.return_value = {"speaker_identification_enabled": True}
    storage.download_text_from_blob.return_value = "--- Speaker 1 @ 00:00:00.120 ---\nHello"
    model_response = Mock(output_text='{"speakers":[{"speaker_id":"1","name":"Jane","confidence":1}]}')
    analysis._get_provider.return_value.client.responses.create.return_value = model_response
    storage.upload_text.side_effect = lambda container, name, text: f"https://storage/recordings/{name}"

    response = service.reprocess({"job_id": "job-1", "create_new_job": True}, correlation_id="op-3", operation_id="op-3")

    assert response.status_code == 200
    clone = cosmos_service.create_job_if_missing.call_args.args[0]
    assert clone["source"] == job["source"]
    assert clone["pre_session_form_data"] == job["pre_session_form_data"]
    updates = cosmos_service.commit_reprocess_result.call_args.kwargs["job_updates"]
    assert updates["transcription_file_path"].endswith("audio__SYS___reprocess_operation_op3_transcript.txt")
    assert updates["transcription_file_path"] != job["transcription_file_path"]
    assert updates["transcription_revision"]
    assert updates["speaker_identification"]["applied"] is True
    assert "Speaker 1: Jane @" in analysis.analyze_conversation.call_args.kwargs["conversation"]
    storage.upload_text_to_blob.assert_not_called()


@patch("services.cosmos_service.CosmosService")
def test_reprocess_still_analyses_the_original_text_if_speaker_enrichment_fails(cosmos_class):
    cosmos_service = Mock()
    cosmos_service.get_job_by_id.return_value = original_job()
    cosmos_service.commit_reprocess_result.return_value = ({"id": "job-1", "status": "completed"}, 1)
    cosmos_class.return_value = cosmos_service
    service, storage, analysis = build_reprocess_service(cosmos_service)
    cosmos_service.get_prompt_metadata.return_value = {"speaker_identification_enabled": True}
    transcript = "--- Speaker 1 @ 00:00:00.120 ---\nHello"
    storage.download_text_from_blob.return_value = transcript
    analysis._get_provider.side_effect = RuntimeError("Provider unavailable")

    response = service.reprocess({"job_id": "job-1"}, correlation_id="op-4", operation_id="op-4")

    assert response.status_code == 200
    assert analysis.analyze_conversation.call_args.kwargs["conversation"] == transcript
    updates = cosmos_service.commit_reprocess_result.call_args.kwargs["job_updates"]
    assert updates["speaker_identification"]["reason"] == "enrichment_failed"
    assert "transcription_file_path" not in updates
    assert storage.upload_text.call_count == 1
