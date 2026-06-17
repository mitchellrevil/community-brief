"""Workflow tests for fail-closed transcription handling."""

import os
import sys
import uuid
from unittest.mock import Mock, patch

import pytest


pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if pkg_root not in sys.path:
    sys.path.insert(0, pkg_root)


@pytest.mark.asyncio
async def test_blob_processing_fails_before_analysis_on_empty_transcript():
    import function_app
    from core.job_status import JobStatus

    job_id = str(uuid.uuid4())
    blob = Mock()
    blob.name = "recordings/test.mp3"
    blob.uri = "https://teststorage.blob.core.windows.net/recordings/test.mp3"
    blob.length = 1024
    blob.metadata = {"job_id": job_id}

    file_doc = {
        "id": job_id,
        "file_path": blob.uri,
        "status": "uploaded",
        "prompt_subcategory_id": "prompt-123",
        "user_id": "user-123",
        "audio_duration_minutes": 5,
    }

    mock_cosmos_service = Mock()
    mock_cosmos_service.get_job_by_id.return_value = file_doc
    mock_cosmos_service.update_job_status.return_value = file_doc

    mock_config = Mock()
    mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
    mock_config.storage_recordings_container = "recordings"
    mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"

    mock_storage_service = Mock()
    mock_transcription_service = Mock()
    mock_transcription_service.submit_transcription_job.return_value = "trans-123"
    mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
    mock_transcription_service.get_results.return_value = "   "

    mock_analysis_service = Mock()

    with patch.object(function_app, "AppConfig", return_value=mock_config), \
         patch("services.cosmos_service.CosmosService", return_value=mock_cosmos_service), \
         patch.object(function_app, "get_blob_storage_service", return_value=mock_storage_service), \
         patch.object(function_app, "get_transcription_service", return_value=mock_transcription_service), \
         patch.object(function_app, "get_analysis_service", return_value=mock_analysis_service), \
         patch("services.file_processing_service.FileProcessingService") as mock_file_proc_cls:

        mock_file_proc = Mock()
        mock_file_proc.get_file_type.return_value = "audio"
        mock_file_proc_cls.return_value = mock_file_proc

        with pytest.raises(ValueError, match="without any recognized text"):
            await function_app._process_blob_with_timeout(
                blob,
                str(uuid.uuid4()),
                blob.uri,
                blob.name,
            )

    statuses = [call.args[1] for call in mock_cosmos_service.update_job_status.call_args_list]
    assert JobStatus.TRANSCRIBED not in statuses
    assert JobStatus.FAILED in statuses
    mock_analysis_service.analyze_conversation.assert_not_called()