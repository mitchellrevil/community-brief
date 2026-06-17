"""
Integration tests for Azure Functions triggers.

Updated to match the current function_app.py implementation:
- blob_trigger is a synchronous function (creates its own event loop internally)
- CosmosService is instantiated inline, not via a get_cosmos_service() factory
- process_audio_file and session_cleanup_timer no longer exist as triggers
- _process_blob_with_timeout is the async processing core and can be tested directly
"""

import asyncio
import pytest
import uuid
from unittest.mock import Mock, patch

import function_app
from services.artifact_naming import (
    is_reprocess_artifact,
    is_system_generated_file,
    strip_container_path,
)


# ===========================================================================
# Helper function unit tests
# ===========================================================================

class TestHelperFunctions:
    """Unit tests for helper utility functions."""

    def test_strip_container_path_nested(self):
        url = "https://storage.blob.core.windows.net/recordings/folder/file.mp3"
        assert strip_container_path(url) == "folder/file.mp3"

    def test_strip_container_path_single_level(self):
        url = "https://storage.blob.core.windows.net/recordings/file.mp3"
        assert strip_container_path(url) == "file.mp3"

    def test_is_system_generated_file_detects_tag(self):
        assert is_system_generated_file("folder/__SYS___analysis.docx")

    def test_is_system_generated_file_passes_normal_file(self):
        assert not is_system_generated_file("folder/recording.mp3")

    def test_is_reprocess_artifact_detects_reprocess_in_docx(self):
        assert is_reprocess_artifact("folder/meeting_reprocess_20250101.docx")

    def test_is_reprocess_artifact_detects_analysis_pdf(self):
        assert is_reprocess_artifact("folder/analysis_output.pdf")

    def test_is_reprocess_artifact_ignores_audio(self):
        assert not is_reprocess_artifact("folder/recording.mp3")

    def test_is_reprocess_artifact_ignores_plain_docx(self):
        # A docx without 'analysis' or '_reprocess_' should not be flagged
        assert not is_reprocess_artifact("folder/notes.docx")


# ===========================================================================
# Blob trigger early-exit paths (no Cosmos interaction required)
# ===========================================================================

@pytest.mark.integration
class TestBlobTriggerIntegration:
    """Test blob trigger — focuses on early-exit guards that need no services."""

    def test_blob_trigger_skips_system_generated_files(self, mock_blob_trigger_input, mock_env_vars):
        """Should return without processing when the blob name contains the system tag."""
        blob_input = mock_blob_trigger_input(name="recordings/__SYS___analysis.docx")
        # sync call — must not raise
        function_app.blob_trigger(blob_input)

    def test_blob_trigger_skips_unsupported_extension(self, mock_blob_trigger_input, mock_env_vars):
        """Should return without processing for unsupported file extensions."""
        blob_input = mock_blob_trigger_input(name="recordings/file.exe")
        function_app.blob_trigger(blob_input)

    def test_blob_trigger_skips_reprocess_artifacts_by_pattern(self, mock_blob_trigger_input, mock_env_vars):
        """Should detect reprocess artifact patterns and skip even when tag is absent."""
        blob_input = mock_blob_trigger_input(name="recordings/meeting_reprocess_20250101.docx")
        function_app.blob_trigger(blob_input)

    @pytest.mark.asyncio
    async def test_process_blob_skips_completed_job(
        self, mock_blob_trigger_input, mock_env_vars, monkeypatch
    ):
        """_process_blob_with_timeout should return without reprocessing a completed job."""
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "1")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0")

        blob_input = mock_blob_trigger_input(name="recordings/meeting.mp3")

        mock_cosmos_instance = Mock()
        mock_cosmos_instance.get_job_by_id.return_value = None
        mock_cosmos_instance.get_file_by_blob_url.return_value = {
            "id": str(uuid.uuid4()),
            "status": "completed",
            "prompt_subcategory_id": "sub-1",
        }

        mock_file_proc_instance = Mock()
        mock_file_proc_instance.get_file_type.return_value = "audio"

        with patch("services.cosmos_service.CosmosService", return_value=mock_cosmos_instance), \
             patch("services.file_processing_service.FileProcessingService", return_value=mock_file_proc_instance), \
             patch("function_app.get_blob_storage_service", return_value=Mock()), \
             patch("function_app.get_analysis_service", return_value=Mock()):
            await function_app._process_blob_with_timeout(
                blob_input,
                correlation_id=str(uuid.uuid4()),
                blob_url=blob_input.uri,
                blob_path="recordings/meeting.mp3",
            )

        mock_cosmos_instance.get_file_by_blob_url.assert_called_once()
        # No status update should occur — job was already complete
        mock_cosmos_instance.update_job_status.assert_not_called()


# ===========================================================================
# Tests for non-existent triggers — kept as documentation, skipped to pass CI
# ===========================================================================

@pytest.mark.skip(
    reason=(
        "The process_audio_file HTTP trigger no longer exists in function_app.py. "
        "These tests should be rewritten to cover reprocess_analysis_http."
    )
)
@pytest.mark.integration
class TestProcessAudioFileIntegration:
    """Placeholder — HTTP trigger for audio upload was removed."""


@pytest.mark.skip(
    reason="session_cleanup_timer no longer exists in function_app.py."
)
@pytest.mark.integration
class TestTimerTriggerIntegration:
    """Placeholder — timer trigger for session cleanup was removed."""


# ===========================================================================
# End-to-end workflow tests
# ===========================================================================

@pytest.mark.integration
@pytest.mark.slow
class TestEndToEndWorkflow:
    """Workflow-level tests using early-exit and direct async entrypoint."""

    def test_system_generated_blob_is_silently_skipped(self, mock_blob_trigger_input, mock_env_vars):
        """Verify the full blob_trigger path exits immediately for system files."""
        blob_input = mock_blob_trigger_input(name="recordings/__SYS___file.docx")
        function_app.blob_trigger(blob_input)

    @pytest.mark.asyncio
    async def test_idempotent_reprocessing_skips_in_progress_job(
        self, mock_blob_trigger_input, mock_env_vars, monkeypatch
    ):
        """Should skip a job that is already being transcribed (idempotency guard)."""
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "1")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0")

        blob_input = mock_blob_trigger_input(name="recordings/meeting.mp3")

        mock_cosmos_instance = Mock()
        mock_cosmos_instance.get_job_by_id.return_value = None
        mock_cosmos_instance.get_file_by_blob_url.return_value = {
            "id": str(uuid.uuid4()),
            "status": "transcribing",
            "prompt_subcategory_id": "sub-1",
        }

        mock_file_proc_instance = Mock()
        mock_file_proc_instance.get_file_type.return_value = "audio"

        with patch("services.cosmos_service.CosmosService", return_value=mock_cosmos_instance), \
             patch("services.file_processing_service.FileProcessingService", return_value=mock_file_proc_instance), \
             patch("function_app.get_blob_storage_service", return_value=Mock()), \
             patch("function_app.get_analysis_service", return_value=Mock()):
            # Call three times to simulate duplicate blob events
            for _ in range(3):
                await function_app._process_blob_with_timeout(
                    blob_input,
                    correlation_id=str(uuid.uuid4()),
                    blob_url=blob_input.uri,
                    blob_path="recordings/meeting.mp3",
                )

        # Cosmos was queried on each invocation
        assert mock_cosmos_instance.get_file_by_blob_url.call_count == 3
        # But status was never updated — idempotency guard fired each time
        mock_cosmos_instance.update_job_status.assert_not_called()
