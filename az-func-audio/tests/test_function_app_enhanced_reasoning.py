from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest


@pytest.mark.asyncio
async def test_blob_trigger_uses_enhanced_reasoning_pipeline_when_enabled():
    import function_app

    mock_blob = Mock()
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.txt"
    mock_blob.name = "recordings/test.txt"
    mock_blob.length = 1024
    mock_blob.metadata = {"job_id": "job-123"}
    mock_blob.read.return_value = b"Meeting transcript"

    mock_config = Mock()
    mock_config.supported_extensions = [".txt", ".mp3", ".wav"]
    mock_config.storage_recordings_container = "recordings"
    mock_config.storage_account_url = "https://storage.blob.core.windows.net"

    mock_cosmos_service = Mock()
    mock_cosmos_service.get_job_by_id.return_value = {
        "id": "job-123",
        "status": "uploaded",
        "prompt_subcategory_id": "prompt-123",
    }
    mock_cosmos_service.get_prompts.return_value = "Primary prompt"
    mock_cosmos_service.get_prompt_metadata.return_value = {
        "enhanced_reasoning_enabled": True,
        "analysis_provider": "responses",
        "prompts": {"summary": "Summarise the meeting."},
        "prompt_constraints": {"summary": {"max_words": 75}},
    }

    mock_storage_service = Mock()
    mock_storage_service.upload_text.return_value = "https://storage/processed.txt"
    mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"

    mock_analysis_service = Mock()

    mock_er_service = Mock()
    mock_er_service.run = AsyncMock(
        return_value=(
            "Enhanced reasoning output",
            SimpleNamespace(iterations=1, flagged_sections=[]),
        )
    )

    with patch.object(function_app, "AppConfig", return_value=mock_config), \
         patch("services.cosmos_service.CosmosService", return_value=mock_cosmos_service), \
         patch.object(function_app, "get_blob_storage_service", return_value=mock_storage_service), \
         patch.object(function_app, "get_analysis_service", return_value=mock_analysis_service), \
         patch("services.file_processing_service.FileProcessingService") as mock_file_processing_cls, \
         patch("services.enhanced_reasoning.orchestration_service.EnhancedReasoningService", return_value=mock_er_service):
        mock_file_processing = Mock()
        mock_file_processing.get_file_type.return_value = "text"
        mock_file_processing.process_file.return_value = "Processed transcript"
        mock_file_processing_cls.return_value = mock_file_processing

        await function_app._process_blob_with_timeout(
            mock_blob,
            "corr-123",
            mock_blob.uri,
            mock_blob.name,
        )

    mock_er_service.run.assert_awaited_once_with(
        transcript="Processed transcript",
        prompts={"summary": "Summarise the meeting."},
        prompt_constraints_raw={"summary": {"max_words": 75}},
    )
    mock_analysis_service.analyze_conversation.assert_not_called()
    assert any(
        call.kwargs.get("enhanced_reasoning_metadata") == {
            "iterations": 1,
            "flagged_sections": [],
        }
        for call in mock_cosmos_service.update_job_status.call_args_list
    )