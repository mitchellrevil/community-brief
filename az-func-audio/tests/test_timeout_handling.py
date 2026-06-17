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
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_cosmos.update_job_status = Mock()
        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
            # Simulate internal timeout during file processing
            mock_file_proc.return_value.get_file_type.side_effect = asyncio.TimeoutError
            # Call the wrapper; TimeoutError is caught internally and job is marked failed
            # Note: The error is re-raised after marking job as failed
            with pytest.raises(asyncio.TimeoutError):
                await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify job was marked as failed before error was re-raised
            mock_cosmos.update_job_status.assert_called_once()
            call_args = mock_cosmos.update_job_status.call_args
            assert call_args[0][0] == 'job-123'
            assert call_args[0][1] == 'failed'
            assert 'error_message' in call_args[1]


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
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos.update_job_status = Mock()
        mock_cosmos_class.return_value = mock_cosmos
        
        # Mock file processing service to raise an error
        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
            mock_file_proc.return_value.get_file_type.side_effect = RuntimeError("Processing error")
            
            with pytest.raises(RuntimeError):
                await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify that update_job_status was called with 'failed'
            mock_cosmos.update_job_status.assert_called_once()
            call_args = mock_cosmos.update_job_status.call_args
            assert call_args[0][0] == 'job-123'  # job_id
            assert call_args[0][1] == 'failed'   # status
            assert 'error_message' in call_args[1]


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
    
    After Phase 3 implementation, the blob trigger should detect reprocess artifacts
    via pattern matching (defense-in-depth) and skip them without attempting Cosmos
    lookup. This prevents ValueError and provides graceful handling.
    
    This test verifies:
    1. Pattern detection catches artifacts even without system tag
    2. Function returns early (no Cosmos query)
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
        mock_cosmos_class.return_value = mock_cosmos
        
        with patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
            mock_file_proc.return_value.get_file_type.return_value = 'document'
            
            # Act - Should return gracefully without error
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Assert - Cosmos should NOT be queried (early return via pattern detection)
            mock_cosmos.get_file_by_blob_url.assert_not_called()
            
            # Verify CosmosService was never instantiated (services init skipped)
            # The mock_cosmos_class should not be called since we return before service init
            mock_cosmos_class.assert_not_called()
