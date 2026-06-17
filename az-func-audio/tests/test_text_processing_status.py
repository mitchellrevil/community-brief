"""
Tests for text/document processing job status updates.

Verifies that text and document file processing uses canonical JobStatus
constants to ensure SSE streaming works correctly.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from core.job_status import JobStatus


class TestTextDocumentProcessingStatuses:
    """Test that text/document processing uses canonical job statuses."""
    
    @pytest.mark.asyncio
    async def test_text_file_processing_uses_canonical_statuses(self):
        """Verify text files go through TRANSCRIBING → TRANSCRIBED status flow."""
        from function_app import _process_blob_with_timeout
        import azure.functions as func
        
        # Mock blob input
        mock_blob = Mock(spec=func.InputStream)
        mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.txt"
        mock_blob.name = "recordings/test.txt"
        mock_blob.length = 1024
        
        correlation_id = "test-correlation-txt"
        blob_url = mock_blob.uri
        blob_path = mock_blob.name
        
        # Patch all required services
        with patch('function_app.AppConfig') as mock_config_class, \
             patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
             patch('function_app.get_blob_storage_service') as mock_storage, \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_class:
            
            # Setup config
            mock_config = Mock()
            mock_config.supported_extensions = ['.txt', '.md', '.docx', '.pdf']
            mock_config.storage_recordings_container = 'recordings'
            mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
            mock_config_class.return_value = mock_config
            
            # Setup cosmos service
            mock_cosmos = Mock()
            mock_cosmos.get_file_by_blob_url.return_value = {
                'id': 'job-txt-123',
                'status': 'uploaded',
                'prompt_subcategory_id': 'test-category'
            }
            mock_cosmos.get_prompts.return_value = "Test prompt text"
            mock_cosmos.get_prompt_metadata.return_value = {
                "type": "prompt_subcategory",
                "prompts": {"default": "Test prompt"}
            }
            mock_cosmos.update_job_status = Mock()
            mock_cosmos_class.return_value = mock_cosmos
            
            # Setup storage service
            mock_storage_svc = Mock()
            mock_storage_svc.upload_text.return_value = "https://storage/processed.txt"
            mock_storage_svc.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
            mock_storage_svc.generate_and_upload_pdf.return_value = "https://storage/analysis.pdf"
            mock_storage.return_value = mock_storage_svc
            
            # Setup file processing service
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = 'text'
            mock_file_proc.process_file.return_value = "Extracted text content from file"
            mock_file_proc_class.return_value = mock_file_proc
            
            # Setup analysis service
            with patch('function_app.get_analysis_service') as mock_analysis:
                mock_analysis_svc = Mock()
                mock_analysis_svc.analyze_conversation.return_value = {
                    'analysis_text': 'Analysis result'
                }
                mock_analysis.return_value = mock_analysis_svc
                
                # Process the blob
                await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify status updates in correct order
            update_calls = mock_cosmos.update_job_status.call_args_list
            
            # Should have at least 3 calls: TRANSCRIBING, TRANSCRIBED, ANALYSING, COMPLETED
            assert len(update_calls) >= 3, f"Expected at least 3 status updates, got {len(update_calls)}"
            
            # Verify TRANSCRIBING status is used (not "text_processed")
            transcribing_call = None
            transcribed_call = None
            for call in update_calls:
                args, kwargs = call
                status = args[1] if len(args) > 1 else None
                if status == JobStatus.TRANSCRIBING:
                    transcribing_call = call
                elif status == JobStatus.TRANSCRIBED:
                    transcribed_call = call
            
            assert transcribing_call is not None, "Should update status to TRANSCRIBING"
            assert transcribed_call is not None, "Should update status to TRANSCRIBED"
            
            # Verify TRANSCRIBED includes transcription_file_path
            transcribed_args, transcribed_kwargs = transcribed_call
            assert 'transcription_file_path' in transcribed_kwargs, \
                "TRANSCRIBED status should include transcription_file_path"
    
    @pytest.mark.asyncio
    async def test_document_file_processing_uses_canonical_statuses(self):
        """Verify document files (.docx) go through TRANSCRIBING → TRANSCRIBED status flow."""
        from function_app import _process_blob_with_timeout
        import azure.functions as func
        
        # Mock blob input for docx file
        mock_blob = Mock(spec=func.InputStream)
        mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.docx"
        mock_blob.name = "recordings/test.docx"
        mock_blob.length = 2048
        
        correlation_id = "test-correlation-docx"
        blob_url = mock_blob.uri
        blob_path = mock_blob.name
        
        # Patch all required services
        with patch('function_app.AppConfig') as mock_config_class, \
             patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
             patch('function_app.get_blob_storage_service') as mock_storage, \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_class:
            
            # Setup config
            mock_config = Mock()
            mock_config.supported_extensions = ['.txt', '.md', '.docx', '.pdf']
            mock_config.storage_recordings_container = 'recordings'
            mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
            mock_config_class.return_value = mock_config
            
            # Setup cosmos service
            mock_cosmos = Mock()
            mock_cosmos.get_file_by_blob_url.return_value = {
                'id': 'job-docx-456',
                'status': 'uploaded',
                'prompt_subcategory_id': 'test-category'
            }
            mock_cosmos.get_prompts.return_value = "Test prompt text"
            mock_cosmos.get_prompt_metadata.return_value = {
                "type": "prompt_subcategory",
                "prompts": {"default": "Test prompt"}
            }
            mock_cosmos.update_job_status = Mock()
            mock_cosmos_class.return_value = mock_cosmos
            
            # Setup storage service
            mock_storage_svc = Mock()
            mock_storage_svc.upload_text.return_value = "https://storage/processed.txt"
            mock_storage_svc.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
            mock_storage_svc.generate_and_upload_pdf.return_value = "https://storage/analysis.pdf"
            mock_storage.return_value = mock_storage_svc
            
            # Setup file processing service (document type)
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = 'document'
            mock_file_proc.process_file.return_value = "Extracted text from Word document"
            mock_file_proc_class.return_value = mock_file_proc
            
            # Setup analysis service
            with patch('function_app.get_analysis_service') as mock_analysis:
                mock_analysis_svc = Mock()
                mock_analysis_svc.analyze_conversation.return_value = {
                    'analysis_text': 'Document analysis result'
                }
                mock_analysis.return_value = mock_analysis_svc
                
                # Process the blob
                await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify status updates in correct order
            update_calls = mock_cosmos.update_job_status.call_args_list
            
            # Check for canonical statuses only (no "document_processed")
            status_updates = [call[0][1] if len(call[0]) > 1 else None for call in update_calls]
            
            # Should NOT contain "document_processed"
            assert "document_processed" not in status_updates, \
                "Should not use 'document_processed' status"
            
            # Should contain canonical statuses
            assert JobStatus.TRANSCRIBING in status_updates, \
                "Should use TRANSCRIBING status for document processing"
            assert JobStatus.TRANSCRIBED in status_updates, \
                "Should use TRANSCRIBED status after document extraction"
    
    @pytest.mark.asyncio
    async def test_text_processing_does_not_use_legacy_status(self):
        """Ensure text processing never sets 'text_processed' status."""
        from function_app import _process_blob_with_timeout
        import azure.functions as func
        
        # Mock blob input
        mock_blob = Mock(spec=func.InputStream)
        mock_blob.uri = "https://storage.blob.core.windows.net/recordings/notes.md"
        mock_blob.name = "recordings/notes.md"
        mock_blob.length = 512
        
        correlation_id = "test-correlation-md"
        blob_url = mock_blob.uri
        blob_path = mock_blob.name
        
        with patch('function_app.AppConfig') as mock_config_class, \
             patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
             patch('function_app.get_blob_storage_service') as mock_storage, \
             patch('services.file_processing_service.FileProcessingService') as mock_file_proc_class:
            
            # Setup mocks (minimal required)
            mock_config = Mock()
            mock_config.supported_extensions = ['.txt', '.md', '.docx']
            mock_config.storage_recordings_container = 'recordings'
            mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
            mock_config_class.return_value = mock_config
            
            mock_cosmos = Mock()
            mock_cosmos.get_file_by_blob_url.return_value = {
                'id': 'job-md-789',
                'status': 'uploaded',
                'prompt_subcategory_id': 'test-category'
            }
            mock_cosmos.get_prompts.return_value = "Prompt"
            mock_cosmos.get_prompt_metadata.return_value = {"prompts": {"default": "P"}}
            mock_cosmos.update_job_status = Mock()
            mock_cosmos_class.return_value = mock_cosmos
            
            mock_storage_svc = Mock()
            mock_storage_svc.upload_text.return_value = "https://storage/processed.txt"
            mock_storage_svc.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
            mock_storage_svc.generate_and_upload_pdf.return_value = "https://storage/analysis.pdf"
            mock_storage.return_value = mock_storage_svc
            
            mock_file_proc = Mock()
            mock_file_proc.get_file_type.return_value = 'text'
            mock_file_proc.process_file.return_value = "# Markdown content"
            mock_file_proc_class.return_value = mock_file_proc
            
            with patch('function_app.get_analysis_service') as mock_analysis:
                mock_analysis_svc = Mock()
                mock_analysis_svc.analyze_conversation.return_value = {'analysis_text': 'A'}
                mock_analysis.return_value = mock_analysis_svc
                
                await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
            
            # Verify no legacy status strings were used
            update_calls = mock_cosmos.update_job_status.call_args_list
            for call in update_calls:
                args, kwargs = call
                status = args[1] if len(args) > 1 else None
                
                # Assert no legacy statuses
                assert status != "text_processed", \
                    "Should not use legacy 'text_processed' status"
                assert status != "document_processed", \
                    "Should not use legacy 'document_processed' status"
                
                # If status is a string, verify it's in canonical set
                if isinstance(status, str):
                    assert status in JobStatus.all_statuses(), \
                        f"Status '{status}' is not in canonical JobStatus set"
