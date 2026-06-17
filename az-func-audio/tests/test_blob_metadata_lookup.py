"""
Tests for blob trigger metadata-based job lookup.

Phase 3: The blob trigger should read job_id from blob metadata first,
falling back to URL-based lookup if metadata is missing.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
import asyncio
import uuid

import sys
import os
pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if pkg_root not in sys.path:
    sys.path.insert(0, pkg_root)


class TestBlobMetadataLookup:
    """Test blob trigger uses metadata-based job lookup."""
    
    @pytest.fixture
    def sample_job_data(self):
        """Provide sample job data for testing."""
        job_id = str(uuid.uuid4())
        return {
            "id": job_id,
            "file_path": "https://teststorage.blob.core.windows.net/recordings/test.mp3",
            "status": "pending",
            "prompt_subcategory_id": "test-prompt",
            "user_id": "test-user",
        }
    
    @pytest.fixture
    def mock_blob_with_metadata(self, sample_job_data):
        """Create a mock blob input with job_id in metadata."""
        blob = Mock()
        blob.name = "recordings/test.mp3"
        blob.uri = "https://teststorage.blob.core.windows.net/recordings/test.mp3"
        blob.length = 1024
        # Azure Functions InputStream has metadata as a dict
        blob.metadata = {"job_id": sample_job_data["id"]}
        blob.read = Mock(return_value=b"fake audio content")
        return blob
    
    @pytest.fixture
    def mock_blob_without_metadata(self):
        """Create a mock blob input without metadata."""
        blob = Mock()
        blob.name = "recordings/test.mp3"
        blob.uri = "https://teststorage.blob.core.windows.net/recordings/test.mp3"
        blob.length = 1024
        # No metadata or empty metadata
        blob.metadata = {}
        blob.read = Mock(return_value=b"fake audio content")
        return blob
    
    @pytest.fixture
    def mock_blob_with_none_metadata(self):
        """Create a mock blob input with None metadata (legacy blobs)."""
        blob = Mock()
        blob.name = "recordings/test.mp3"
        blob.uri = "https://teststorage.blob.core.windows.net/recordings/test.mp3"
        blob.length = 1024
        blob.metadata = None
        blob.read = Mock(return_value=b"fake audio content")
        return blob

    @pytest.mark.asyncio
    async def test_blob_with_metadata_fetches_job_by_id_no_retries(
        self,
        mock_blob_with_metadata,
        sample_job_data,
        monkeypatch
    ):
        """When blob has job_id metadata, should fetch job by ID without URL-based retries."""
        # Import function app
        import function_app
        from core.job_status import JobStatus
        
        # Mock cosmos service
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id.return_value = sample_job_data
        mock_cosmos_service.get_file_by_blob_url = Mock()  # Should NOT be called
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Test prompt"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        # Mock config
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        # Mock services
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/text.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Transcribed text content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis result"
        }
        
        # Set up patches
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            # Execute the blob processing
            await function_app._process_blob_with_timeout(
                mock_blob_with_metadata,
                str(uuid.uuid4()),  # correlation_id
                mock_blob_with_metadata.uri,
                mock_blob_with_metadata.name
            )
        
        # Verify: get_job_by_id was called with the job_id from metadata
        mock_cosmos_service.get_job_by_id.assert_called_once_with(sample_job_data["id"])
        
        # Verify: get_file_by_blob_url should NOT have been called (no fallback needed)
        mock_cosmos_service.get_file_by_blob_url.assert_not_called()

    @pytest.mark.asyncio
    async def test_blob_without_metadata_falls_back_to_url_lookup_with_retries(
        self,
        mock_blob_without_metadata,
        sample_job_data,
        monkeypatch
    ):
        """When blob has no metadata, should fall back to URL-based lookup with retries."""
        import function_app
        from core.job_status import JobStatus
        
        # Set environment variables for faster test execution
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "2")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0.01")
        
        # Mock cosmos service - first attempt returns None, second returns job
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id = Mock()  # Should NOT be called
        mock_cosmos_service.get_file_by_blob_url.side_effect = [None, sample_job_data]
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Test prompt"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        # Mock config
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        # Mock services
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/text.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Transcribed text content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis result"
        }
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            await function_app._process_blob_with_timeout(
                mock_blob_without_metadata,
                str(uuid.uuid4()),
                mock_blob_without_metadata.uri,
                mock_blob_without_metadata.name
            )
        
        # Verify: get_job_by_id should NOT be called (no metadata)
        mock_cosmos_service.get_job_by_id.assert_not_called()
        
        # Verify: get_file_by_blob_url should have been called with retries
        assert mock_cosmos_service.get_file_by_blob_url.call_count == 2

    @pytest.mark.asyncio
    async def test_blob_with_none_metadata_falls_back_to_url_lookup(
        self,
        mock_blob_with_none_metadata,
        sample_job_data,
        monkeypatch
    ):
        """When blob metadata is None (legacy), should fall back to URL-based lookup."""
        import function_app
        
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "1")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0.01")
        
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id = Mock()
        mock_cosmos_service.get_file_by_blob_url.return_value = sample_job_data
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Test prompt"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/text.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Transcribed text content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis result"
        }
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            await function_app._process_blob_with_timeout(
                mock_blob_with_none_metadata,
                str(uuid.uuid4()),
                mock_blob_with_none_metadata.uri,
                mock_blob_with_none_metadata.name
            )
        
        # Verify: get_job_by_id should NOT be called (metadata is None)
        mock_cosmos_service.get_job_by_id.assert_not_called()
        
        # Verify: get_file_by_blob_url was called (fallback path)
        mock_cosmos_service.get_file_by_blob_url.assert_called()

    @pytest.mark.asyncio
    async def test_blob_metadata_lookup_failure_falls_back_to_url_lookup(
        self,
        mock_blob_with_metadata,
        sample_job_data,
        monkeypatch
    ):
        """When metadata lookup fails (invalid job_id), should fall back to URL lookup."""
        import function_app
        from services.cosmos_service import CosmosServiceError
        
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "1")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0.01")
        
        # get_job_by_id returns None (job not found by ID)
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id.return_value = None
        mock_cosmos_service.get_file_by_blob_url.return_value = sample_job_data
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Test prompt"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/text.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Transcribed text content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis result"
        }
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            await function_app._process_blob_with_timeout(
                mock_blob_with_metadata,
                str(uuid.uuid4()),
                mock_blob_with_metadata.uri,
                mock_blob_with_metadata.name
            )
        
        # Verify: get_job_by_id was attempted first
        mock_cosmos_service.get_job_by_id.assert_called_once()
        
        # Verify: get_file_by_blob_url was called as fallback
        mock_cosmos_service.get_file_by_blob_url.assert_called()

    @pytest.mark.asyncio
    async def test_blob_metadata_lookup_logs_fast_path(
        self,
        mock_blob_with_metadata,
        sample_job_data,
        monkeypatch,
        caplog
    ):
        """When metadata lookup succeeds, should log that fast path was used."""
        import function_app
        import logging
        
        caplog.set_level(logging.INFO)
        
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id.return_value = sample_job_data
        mock_cosmos_service.get_file_by_blob_url = Mock()
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Test prompt"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/text.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Transcribed text content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis result"
        }
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            await function_app._process_blob_with_timeout(
                mock_blob_with_metadata,
                str(uuid.uuid4()),
                mock_blob_with_metadata.uri,
                mock_blob_with_metadata.name
            )
        
        # Check that fast path was logged
        log_messages = [record.message for record in caplog.records]
        assert any("metadata" in msg.lower() or "fast" in msg.lower() for msg in log_messages), \
            f"Expected log about metadata lookup, got: {log_messages}"


class TestRaceConditionBlobFirstThenJob:
    """
    End-to-end test for the race scenario: blob arrives before job document.
    
    This simulates when the blob trigger fires before the backend has finished
    creating the Cosmos job document. The retry mechanism should handle this
    gracefully and processing should complete successfully once the job appears.
    """
    
    @pytest.fixture
    def sample_job_data(self):
        """Provide sample job data for testing."""
        job_id = str(uuid.uuid4())
        return {
            "id": job_id,
            "file_path": "https://teststorage.blob.core.windows.net/recordings/test.mp3",
            "status": "pending",
            "prompt_subcategory_id": "test-prompt",
            "user_id": "test-user",
        }
    
    @pytest.fixture
    def mock_blob_without_metadata(self):
        """Create a mock blob input without metadata (simulates legacy upload or race)."""
        blob = Mock()
        blob.name = "recordings/test.mp3"
        blob.uri = "https://teststorage.blob.core.windows.net/recordings/test.mp3"
        blob.length = 1024
        blob.metadata = {}  # No metadata - forces URL-based lookup with retries
        blob.read = Mock(return_value=b"fake audio content")
        return blob

    @pytest.mark.asyncio
    async def test_race_condition_blob_first_job_arrives_later_succeeds(
        self,
        mock_blob_without_metadata,
        sample_job_data,
        monkeypatch
    ):
        """
        Race scenario: Blob trigger fires before job document exists in Cosmos.
        
        Flow:
        1. Blob is uploaded and triggers function
        2. First lookup attempt returns None (job not yet created by backend)
        3. Retry logic waits and retries
        4. Second/subsequent attempt finds the job (backend has completed)
        5. Processing completes successfully
        
        This validates the retry mechanism handles the race condition gracefully.
        """
        import function_app
        from core.job_status import JobStatus
        
        # Use fast retry settings for the test
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "3")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0.01")  # 10ms delay
        
        # Track call count to simulate job appearing after delay
        lookup_call_count = 0
        
        def delayed_job_lookup(blob_url):
            """
            Simulates race condition: job not found on first 2 attempts,
            then found on third attempt (after backend completes creation).
            """
            nonlocal lookup_call_count
            lookup_call_count += 1
            if lookup_call_count < 3:
                # Job not yet created by backend
                return None
            # Job now exists (backend finished creating it)
            return sample_job_data
        
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_job_by_id = Mock()  # Not called (no metadata)
        mock_cosmos_service.get_file_by_blob_url.side_effect = delayed_job_lookup
        mock_cosmos_service.update_job_status.return_value = sample_job_data
        mock_cosmos_service.get_prompts.return_value = "Analyze this meeting transcript"
        mock_cosmos_service.get_prompt_metadata.return_value = {}
        
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        mock_storage_service = Mock()
        mock_storage_service.upload_text.return_value = "https://storage/transcription.txt"
        mock_storage_service.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        
        mock_transcription_service = Mock()
        mock_transcription_service.submit_transcription_job.return_value = "trans-abc123"
        mock_transcription_service.check_status.return_value = {"status": "Succeeded"}
        mock_transcription_service.get_results.return_value = "Meeting transcript content"
        
        mock_analysis_service = Mock()
        mock_analysis_service.analyze_conversation.return_value = {
            "analysis_text": "Analysis of meeting transcript"
        }
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch.object(function_app, 'get_blob_storage_service', return_value=mock_storage_service), \
             patch.object(function_app, 'get_transcription_service', return_value=mock_transcription_service), \
             patch.object(function_app, 'get_analysis_service', return_value=mock_analysis_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            # Execute the blob processing - should succeed despite initial race
            await function_app._process_blob_with_timeout(
                mock_blob_without_metadata,
                str(uuid.uuid4()),  # correlation_id
                mock_blob_without_metadata.uri,
                mock_blob_without_metadata.name
            )
        
        # Verify: URL-based lookup was retried until job was found
        assert mock_cosmos_service.get_file_by_blob_url.call_count == 3, \
            f"Expected 3 lookup attempts (2 failures + 1 success), got {mock_cosmos_service.get_file_by_blob_url.call_count}"
        
        # Verify: get_job_by_id was NOT called (no metadata in blob)
        mock_cosmos_service.get_job_by_id.assert_not_called()
        
        # Verify: Processing continued to completion after job was found
        mock_transcription_service.submit_transcription_job.assert_called_once()
        mock_analysis_service.analyze_conversation.assert_called_once()
        mock_storage_service.generate_and_upload_docx.assert_called_once()
        
        # Verify: Job status was updated to COMPLETED
        final_status_call = mock_cosmos_service.update_job_status.call_args_list[-1]
        assert final_status_call[0][1] == JobStatus.COMPLETED, \
            f"Expected final status COMPLETED, got {final_status_call[0][1]}"

    @pytest.mark.asyncio
    async def test_race_condition_blob_first_exhausts_retries_fails_gracefully(
        self,
        mock_blob_without_metadata,
        monkeypatch
    ):
        """
        Race scenario extreme case: Job never appears within retry window.
        
        This tests the failure path when retries are exhausted and the job
        document is not found. The function should raise an error with a
        clear message rather than hang indefinitely.
        """
        import function_app
        
        # Use minimal retries for fast test execution
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_RETRIES", "2")
        monkeypatch.setenv("BLOB_TRIGGER_LOOKUP_DELAY_SECONDS", "0.01")
        
        mock_cosmos_service = Mock()
        mock_cosmos_service.get_file_by_blob_url.return_value = None  # Never found
        mock_cosmos_service.update_job_status = Mock()
        
        mock_config = Mock()
        mock_config.supported_extensions = [".mp3", ".wav", ".m4a"]
        mock_config.storage_recordings_container = "recordings"
        mock_config.storage_account_url = "https://teststorage.blob.core.windows.net"
        
        with patch.object(function_app, 'AppConfig', return_value=mock_config), \
             patch('services.cosmos_service.CosmosService', return_value=mock_cosmos_service), \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_cls:
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = "audio"
            mock_file_proc_cls.return_value = mock_file_proc
            
            # Execute and expect ValueError when job not found
            with pytest.raises(ValueError, match="File document not found"):
                await function_app._process_blob_with_timeout(
                    mock_blob_without_metadata,
                    str(uuid.uuid4()),
                    mock_blob_without_metadata.uri,
                    mock_blob_without_metadata.name
                )
        
        # Verify: All retry attempts were exhausted (should match retry count)
        # The function makes max_retries number of attempts before failing
        assert mock_cosmos_service.get_file_by_blob_url.call_count >= 2, \
            f"Expected at least 2 lookup attempts (retry count), got {mock_cosmos_service.get_file_by_blob_url.call_count}"
