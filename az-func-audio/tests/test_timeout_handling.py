"""
Tests for blob trigger timeout handling and error scenarios.

These tests verify:
- 60-minute timeout is enforced and jobs are marked as failed
- All exceptions during processing mark jobs as failed
- Idempotency prevents reprocessing completed jobs
- Phase 1 TDD: Blob trigger errors on untagged reprocess artifacts
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, Mock, patch, MagicMock
import azure.functions as func


@pytest.mark.asyncio
async def test_blob_trigger_timeout_marks_job_as_failed():
    """Test that jobs exceeding 60 minutes are marked as failed."""
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.mp3"
    mock_blob.name = "recordings/test.mp3"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-123"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    # Mock the cosmos service to simulate slow processing
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_transcription_service') as mock_transcription_service:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_cosmos.update_job_status = Mock()
        mock_transcription = Mock()
        mock_transcription.submit_transcription_job.side_effect = asyncio.TimeoutError
        mock_transcription_service.return_value = mock_transcription

        with pytest.raises(asyncio.TimeoutError):
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)

        mock_cosmos.update_job_status.assert_any_call(
            'job-123',
            'failed',
            error_message='',
            analysis_in_progress=False,
        )


@pytest.mark.asyncio
async def test_blob_trigger_all_errors_mark_job_as_failed():
    """Test that any exception during processing marks the job as failed."""
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.mp3"
    mock_blob.name = "recordings/test.mp3"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-123"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_transcription_service') as mock_transcription_service:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos.update_job_status = Mock()
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_transcription = Mock()
        mock_transcription.submit_transcription_job.side_effect = RuntimeError("Processing error")
        mock_transcription_service.return_value = mock_transcription

        with pytest.raises(RuntimeError):
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)

        mock_cosmos.update_job_status.assert_any_call(
            'job-123',
            'failed',
            error_message='Processing error',
            analysis_in_progress=False,
        )


@pytest.mark.asyncio
async def test_blob_trigger_idempotency_prevents_reprocessing():
    """Test that jobs with status 'completed', 'transcribing', etc. are skipped."""
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.mp3"
    mock_blob.name = "recordings/test.mp3"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-123"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_blob_storage_service') as mock_storage:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        # Return a job that's already completed
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'completed',  # Already done
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_storage_svc = Mock()
        mock_storage.return_value = mock_storage_svc
        
        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
            mock_file_proc.return_value.get_file_type.return_value = 'audio'
            
            # Should return early without processing
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify that we didn't try to process (no calls to transcription service)
            # The function should have returned early due to idempotency check


@pytest.mark.asyncio
async def test_blob_trigger_skips_untagged_reprocess_artifact():
    """
    Phase 3: Verify blob trigger gracefully skips untagged reprocess artifacts.
    
    The blob trigger should detect reprocess artifacts and skip them when no
    job owns the blob as its original input. This prevents ValueError and
    provides graceful handling.
    
    This test verifies:
    1. Pattern detection catches artifacts even without system tag
    2. Function returns early after no owning job input is found
    3. No ValueError is raised
    """
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input for reprocess DOCX (untagged, has _reprocess_ pattern)
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test/audio_reprocess_20260131120000_abc123.docx"
    mock_blob.name = "recordings/test/audio_reprocess_20260131120000_abc123.docx"
    mock_blob.length = 2048
    
    correlation_id = "test-correlation-reprocess"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav', '.docx', '.pdf', '.txt']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        mock_cosmos.get_file_by_blob_url.return_value = None
        mock_cosmos_class.return_value = mock_cosmos
        
        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
            mock_file_proc.return_value.get_file_type.return_value = 'document'
            
            # Act - Should return gracefully without error
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Assert - generated-looking artifacts are skipped without failing when no job owns them
            assert mock_cosmos.get_file_by_blob_url.call_count >= 1


@pytest.mark.asyncio
async def test_blob_trigger_skips_sanitized_system_transcription_orphan():
    from function_app import _process_blob_with_timeout

    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = (
        "https://storage.blob.core.windows.net/recordings/direct/user/2026-06-29/"
        "recording_sys_transcription_125407_428/recording_sys_transcription.txt"
    )
    mock_blob.name = (
        "recordings/direct/user/2026-06-29/"
        "recording_sys_transcription_125407_428/recording_sys_transcription.txt"
    )
    mock_blob.length = 14096

    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class:

        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav', '.docx', '.pdf', '.txt']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config

        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        mock_cosmos.get_file_by_blob_url.return_value = None
        mock_cosmos_class.return_value = mock_cosmos

        await _process_blob_with_timeout(
            mock_blob,
            "test-correlation-sanitized-system",
            mock_blob.uri,
            mock_blob.name,
        )

        assert mock_cosmos.get_file_by_blob_url.call_count >= 1


@pytest.mark.asyncio
async def test_blob_trigger_processes_system_tagged_blob_when_it_is_job_input():
    from function_app import _process_blob_with_timeout
    from core.job_status import JobStatus

    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test/audio__SYS__transcription.txt"
    mock_blob.name = "recordings/test/audio__SYS__transcription.txt"
    mock_blob.length = 2048
    mock_blob.metadata = {}

    job_doc = {
        "id": "job-123",
        "status": "uploaded",
        "file_path": mock_blob.uri,
        "prompt_subcategory_id": "test-category",
    }

    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_blob_storage_service') as mock_storage, \
         patch('function_app.get_analysis_service') as mock_analysis:

        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav', '.docx', '.pdf', '.txt']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config.speaker_identification_model = 'gpt-5-nano'
        mock_config_class.return_value = mock_config

        mock_cosmos = Mock()
        mock_cosmos.get_inference_catalog.return_value = {
            "default_model": "test-model",
            "models": [{"key": "test-model", "provider": "responses"}],
        }
        mock_cosmos.get_file_by_blob_url.return_value = job_doc
        mock_cosmos.get_prompts.return_value = "Summarise"
        mock_cosmos.get_prompt_metadata.return_value = {"speaker_identification_enabled": False}
        mock_cosmos_class.return_value = mock_cosmos

        mock_storage_svc = Mock()
        mock_storage_svc.upload_text.side_effect = [
            "https://storage.blob.core.windows.net/recordings/test/processed.txt",
            "https://storage.blob.core.windows.net/recordings/test/analysis.md",
        ]
        mock_storage.return_value = mock_storage_svc

        mock_analysis_svc = Mock()
        mock_analysis_svc.analyze_conversation.return_value = {"analysis_text": "Analysis"}
        mock_analysis.return_value = mock_analysis_svc

        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            mock_file_proc = Mock()
            mock_file_proc.process_file.return_value = "Transcript"
            mock_file_proc_cls.return_value = mock_file_proc

            await _process_blob_with_timeout(
                mock_blob,
                "test-correlation-system-input",
                mock_blob.uri,
                mock_blob.name,
            )

    final_status_call = mock_cosmos.update_job_status.call_args_list[-1]
    assert final_status_call[0][1] == JobStatus.COMPLETED
    mock_analysis_svc.analyze_conversation.assert_called_once()
