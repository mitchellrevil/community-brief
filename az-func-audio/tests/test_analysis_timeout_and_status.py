"""
Tests for analysis phase timeout handling and ANALYSING status updates.

These tests verify:
1. Job status is updated to ANALYSING before analysis service is called
2. Analysis providers have 15-minute timeout on OpenAI API calls
3. Timeout errors are properly caught and jobs are marked FAILED
4. Error messages are informative for user visibility
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import azure.functions as func

from openai import APITimeoutError, APIConnectionError

from services.analysis_providers.responses_provider import ResponsesProvider
from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
from services.analysis_service import AnalysisService, AnalysisServiceError
from core.job_status import JobStatus


# ==================== ResponsesProvider Timeout Tests ====================

def test_responses_provider_passes_timeout_to_api_call(app_config):
    """Verify ResponsesProvider passes timeout=900 to responses.create()."""
    provider = ResponsesProvider(config=app_config)
    
    mock_response = Mock()
    mock_response.output_text = "Analysis result"
    provider.client.responses.create = Mock(return_value=mock_response)
    
    result = provider.analyze(
        conversation="Meeting transcript here",
        context="",
        model="gpt-5.1",
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    # Verify timeout was passed to create()
    provider.client.responses.create.assert_called_once()
    call_kwargs = provider.client.responses.create.call_args[1]
    assert "timeout" in call_kwargs
    assert call_kwargs["timeout"] == 900


def test_responses_provider_catches_api_timeout_error(app_config):
    """Verify ResponsesProvider catches APITimeoutError and raises AnalysisServiceError."""
    provider = ResponsesProvider(config=app_config)
    
    # Mock the API to raise a timeout error
    timeout_error = APITimeoutError(request=Mock())
    provider.client.responses.create = Mock(side_effect=timeout_error)
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        provider.analyze(
            conversation="Meeting transcript here",
            context="",
            model="gpt-5.1",
            reasoning_effort=None,
            verbosity=None,
            max_output_tokens=None,
            temperature=None,
            max_tokens=None,
            top_p=None
        )
    
    # Error message should be informative
    assert "timeout" in str(exc_info.value).lower() or "15 minute" in str(exc_info.value).lower()


def test_responses_provider_catches_api_connection_error(app_config):
    """Verify ResponsesProvider catches APIConnectionError and raises AnalysisServiceError."""
    provider = ResponsesProvider(config=app_config)
    
    # Mock the API to raise a connection error
    connection_error = APIConnectionError(request=Mock())
    provider.client.responses.create = Mock(side_effect=connection_error)
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        provider.analyze(
            conversation="Meeting transcript here",
            context="",
            model="gpt-5.1",
            reasoning_effort=None,
            verbosity=None,
            max_output_tokens=None,
            temperature=None,
            max_tokens=None,
            top_p=None
        )
    
    # Error message should mention connection issue
    assert "connection" in str(exc_info.value).lower()


# ==================== ChatCompletionsProvider Timeout Tests ====================

def test_chat_completions_provider_passes_timeout_to_api_call(app_config):
    """Verify ChatCompletionsProvider passes timeout=900 to completions.create()."""
    provider = ChatCompletionsProvider(config=app_config)
    
    # Mock chat completion response
    mock_response = Mock()
    mock_choice = Mock()
    mock_message = Mock()
    mock_message.content = "Analysis result from chat completions"
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    provider.client.chat.completions.create = Mock(return_value=mock_response)
    
    result = provider.analyze(
        conversation="Meeting transcript here",
        context="",
        model="gpt-4.1",
        reasoning_effort=None,
        verbosity=None,
        max_output_tokens=None,
        temperature=None,
        max_tokens=None,
        top_p=None
    )
    
    # Verify timeout was passed to create()
    provider.client.chat.completions.create.assert_called_once()
    call_kwargs = provider.client.chat.completions.create.call_args[1]
    assert "timeout" in call_kwargs
    assert call_kwargs["timeout"] == 900


def test_chat_completions_provider_catches_api_timeout_error(app_config):
    """Verify ChatCompletionsProvider catches APITimeoutError and raises AnalysisServiceError."""
    provider = ChatCompletionsProvider(config=app_config)
    
    # Mock the API to raise a timeout error
    timeout_error = APITimeoutError(request=Mock())
    provider.client.chat.completions.create = Mock(side_effect=timeout_error)
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        provider.analyze(
            conversation="Meeting transcript here",
            context="",
            model="gpt-4.1",
            reasoning_effort=None,
            verbosity=None,
            max_output_tokens=None,
            temperature=None,
            max_tokens=None,
            top_p=None
        )
    
    # Error message should be informative
    assert "timeout" in str(exc_info.value).lower() or "15 minute" in str(exc_info.value).lower()


def test_chat_completions_provider_catches_api_connection_error(app_config):
    """Verify ChatCompletionsProvider catches APIConnectionError and raises AnalysisServiceError."""
    provider = ChatCompletionsProvider(config=app_config)
    
    # Mock the API to raise a connection error
    connection_error = APIConnectionError(request=Mock())
    provider.client.chat.completions.create = Mock(side_effect=connection_error)
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        provider.analyze(
            conversation="Meeting transcript here",
            context="",
            model="gpt-4.1",
            reasoning_effort=None,
            verbosity=None,
            max_output_tokens=None,
            temperature=None,
            max_tokens=None,
            top_p=None
        )
    
    # Error message should mention connection issue
    assert "connection" in str(exc_info.value).lower()


# ==================== Function App Status Update Tests ====================

@pytest.mark.asyncio
async def test_blob_trigger_updates_status_to_analysing_before_analysis():
    """
    Verify that _process_blob_with_timeout updates job status to ANALYSING
    before calling the analysis service.
    
    This ensures the UI shows 'Analysing' status during long-running analysis.
    """
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input for a text file (simpler path than audio)
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.txt"
    mock_blob.name = "recordings/test.txt"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-analyzing"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    status_updates = []  # Track all status update calls
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_blob_storage_service') as mock_storage, \
         patch('function_app.get_analysis_service') as mock_analysis_svc, \
         patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.txt', '.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos.get_prompts.return_value = "Test prompt"
        mock_cosmos.get_prompt_metadata.return_value = {}
        
        # Track status updates
        def track_status_update(job_id, status, **kwargs):
            status_updates.append((job_id, status, kwargs))
        mock_cosmos.update_job_status = Mock(side_effect=track_status_update)
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_file_proc.return_value.get_file_type.return_value = 'text'
        mock_file_proc.return_value.process_file.return_value = "Processed text content"
        
        mock_storage_svc = Mock()
        mock_storage_svc.upload_text.return_value = "https://storage/transcription.txt"
        mock_storage_svc.generate_and_upload_docx.return_value = "https://storage/analysis.docx"
        mock_storage.return_value = mock_storage_svc
        
        mock_analysis = Mock()
        mock_analysis.analyze_conversation.return_value = {"analysis_text": "Analysis result"}
        mock_analysis_svc.return_value = mock_analysis
        
        # Run the blob trigger
        await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
        
        # Verify status updates sequence
        status_sequence = [update[1] for update in status_updates]
        
        # Should have: TRANSCRIBING -> TRANSCRIBED -> ANALYSING -> COMPLETED
        assert JobStatus.TRANSCRIBING in status_sequence
        assert JobStatus.TRANSCRIBED in status_sequence
        assert JobStatus.ANALYSING in status_sequence
        assert JobStatus.COMPLETED in status_sequence
        
        # ANALYSING should come BEFORE COMPLETED
        analyzing_idx = status_sequence.index(JobStatus.ANALYSING)
        completed_idx = status_sequence.index(JobStatus.COMPLETED)
        assert analyzing_idx < completed_idx
        
        # Verify ANALYSING update includes expected metadata
        analyzing_call = [u for u in status_updates if u[1] == JobStatus.ANALYSING][0]
        assert 'analysis_started_at' in analyzing_call[2]
        assert analyzing_call[2].get('analysis_in_progress') is True


@pytest.mark.asyncio
async def test_blob_trigger_marks_job_failed_on_analysis_timeout():
    """
    Verify that analysis timeout errors result in job being marked as FAILED
    with an informative error message.
    """
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.txt"
    mock_blob.name = "recordings/test.txt"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-timeout"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_blob_storage_service') as mock_storage, \
         patch('function_app.get_analysis_service') as mock_analysis_svc, \
         patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.txt', '.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos.get_prompts.return_value = "Test prompt"
        mock_cosmos.get_prompt_metadata.return_value = {}
        mock_cosmos.update_job_status = Mock()
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_file_proc.return_value.get_file_type.return_value = 'text'
        mock_file_proc.return_value.process_file.return_value = "Processed text content"
        
        mock_storage_svc = Mock()
        mock_storage_svc.upload_text.return_value = "https://storage/transcription.txt"
        mock_storage.return_value = mock_storage_svc
        
        mock_analysis = Mock()
        # Simulate analysis service raising timeout error
        mock_analysis.analyze_conversation.side_effect = AnalysisServiceError(
            "Analysis timeout: OpenAI API call exceeded 15 minute limit"
        )
        mock_analysis_svc.return_value = mock_analysis
        
        # Run the blob trigger - should catch and handle the error
        with pytest.raises(AnalysisServiceError):
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
        
        # Verify job was marked as failed
        failed_calls = [
            call for call in mock_cosmos.update_job_status.call_args_list
            if call[0][1] == JobStatus.FAILED
        ]
        assert len(failed_calls) >= 1
        
        # Verify error message was included
        failed_call = failed_calls[-1]
        assert 'error_message' in failed_call[1]
        assert 'timeout' in failed_call[1]['error_message'].lower() or 'Analysis' in failed_call[1]['error_message']


@pytest.mark.asyncio
async def test_blob_trigger_clears_analysis_in_progress_on_failure():
    """
    Verify that analysis_in_progress is set to False when analysis fails.
    This prevents the UI from showing stuck 'Analysing' state.
    """
    from function_app import _process_blob_with_timeout
    
    # Create mock blob input
    mock_blob = Mock(spec=func.InputStream)
    mock_blob.uri = "https://storage.blob.core.windows.net/recordings/test.txt"
    mock_blob.name = "recordings/test.txt"
    mock_blob.length = 1024
    
    correlation_id = "test-correlation-in-progress"
    blob_url = mock_blob.uri
    blob_path = mock_blob.name
    
    with patch('function_app.AppConfig') as mock_config_class, \
         patch('services.cosmos_service.CosmosService') as mock_cosmos_class, \
         patch('function_app.get_blob_storage_service') as mock_storage, \
         patch('function_app.get_analysis_service') as mock_analysis_svc, \
         patch('services.file_processing_service.FileProcessingService') as mock_file_proc:
        
        mock_config = Mock()
        mock_config.supported_extensions = ['.txt', '.mp3', '.wav']
        mock_config.storage_recordings_container = 'recordings'
        mock_config.storage_account_url = 'https://storage.blob.core.windows.net'
        mock_config_class.return_value = mock_config
        
        mock_cosmos = Mock()
        mock_cosmos.get_file_by_blob_url.return_value = {
            'id': 'job-123',
            'status': 'uploaded',
            'prompt_subcategory_id': 'test-category'
        }
        mock_cosmos.get_prompts.return_value = "Test prompt"
        mock_cosmos.get_prompt_metadata.return_value = {}
        mock_cosmos.update_job_status = Mock()
        mock_cosmos_class.return_value = mock_cosmos
        
        mock_file_proc.return_value.get_file_type.return_value = 'text'
        mock_file_proc.return_value.process_file.return_value = "Processed text content"
        
        mock_storage_svc = Mock()
        mock_storage_svc.upload_text.return_value = "https://storage/transcription.txt"
        mock_storage.return_value = mock_storage_svc
        
        mock_analysis = Mock()
        mock_analysis.analyze_conversation.side_effect = RuntimeError("Generic analysis error")
        mock_analysis_svc.return_value = mock_analysis
        
        # Run the blob trigger
        with pytest.raises(RuntimeError):
            await _process_blob_with_timeout(mock_blob, correlation_id, blob_url, blob_path)
        
        # Find the last FAILED status update
        failed_calls = [
            call for call in mock_cosmos.update_job_status.call_args_list
            if call[0][1] == JobStatus.FAILED
        ]
        assert len(failed_calls) >= 1
        
        # Verify analysis_in_progress was set to False
        last_failed_call = failed_calls[-1]
        assert last_failed_call[1].get('analysis_in_progress') is False


# ==================== AnalysisService Error Propagation Tests ====================

def test_analysis_service_propagates_timeout_error(app_config):
    """Verify AnalysisService wraps provider timeout errors as AnalysisServiceError."""
    mock_provider = Mock()
    mock_provider.analyze.side_effect = AnalysisServiceError(
        "Analysis timeout: OpenAI API call exceeded 15 minute limit"
    )
    provider_class = Mock(return_value=mock_provider)
    
    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        service.analyze_conversation(
            conversation="Test conversation",
            context="Test context",
            provider_name="responses"
        )
    
    assert "timeout" in str(exc_info.value).lower()


def test_analysis_service_propagates_connection_error(app_config):
    """Verify AnalysisService wraps provider connection errors as AnalysisServiceError."""
    mock_provider = Mock()
    mock_provider.analyze.side_effect = AnalysisServiceError(
        "API connection failed: Unable to connect to OpenAI endpoint"
    )
    provider_class = Mock(return_value=mock_provider)
    
    service = AnalysisService(
        config=app_config,
        provider_registry={"responses": provider_class}
    )
    
    with pytest.raises(AnalysisServiceError) as exc_info:
        service.analyze_conversation(
            conversation="Test conversation",
            context="Test context",
            provider_name="responses"
        )
    
    assert "connection" in str(exc_info.value).lower()
