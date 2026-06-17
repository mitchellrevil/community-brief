"""
Tests for reprocess analysis functionality.

Phase 1 (Complete): TDD tests documenting bugs in reprocess flow.
Phase 2 (Complete): Implementation fixes for system-tagged blob names.
"""
import json
from unittest.mock import Mock, patch, MagicMock
import pytest
import function_app
import azure.functions as func
from services.artifact_naming import (
    build_analysis_blob_name,
    get_system_generated_tag,
    is_reprocess_artifact,
    is_system_generated_file,
)


# =============================================================================
# Phase 1 TDD Tests - Document Current Bugs
# =============================================================================

def test_build_analysis_blob_name_includes_system_tag():
    """
    Phase 2: Verify that _build_analysis_blob_name() produces tagged names.
    
    This test verifies that blob names generated for reprocess artifacts
    include the SYSTEM_GENERATED_TAG (__SYS__) to prevent retriggering
    the blob pipeline.
    """
    # Arrange
    blob_url = "https://storage.blob.core.windows.net/recordings/test/audio.mp3"
    
    # Act
    blob_name = build_analysis_blob_name(blob_url)
    
    # Assert - Tag should be present in the blob name
    tag = get_system_generated_tag()
    assert tag in blob_name, f"Expected blob name to contain '{tag}' but got: {blob_name}"
    assert "_reprocess_" in blob_name, "Expected blob name to contain '_reprocess_' pattern"
    # Verify the pattern: base__SYS___reprocess_timestamp_suffix.docx
    assert blob_name.endswith(".docx"), "Expected blob name to end with .docx"
    assert tag + "_reprocess_" in blob_name, f"Expected pattern '{tag}_reprocess_' in blob name"


@patch('services.cosmos_service.CosmosService')
@patch('function_app.get_blob_storage_service')
@patch('function_app.get_analysis_service')
def test_reprocess_generates_tagged_blob_name(mock_get_analysis, mock_get_storage, mock_cosmos_class):
    """
    Phase 2: Integration test verifying reprocess HTTP endpoint creates tagged blob names.
    
    This test captures the blob name passed to storage service during reprocess
    and verifies it contains both _reprocess_ AND the system tag.
    """
    # Arrange
    cosmos_service = Mock()
    job = {
        "id": "job-1",
        "file_path": "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        "transcription_file_path": "https://storage.blob.core.windows.net/recordings/test/audio__SYS__transcription.txt",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
    }
    cosmos_service.get_job_by_id.return_value = job
    cosmos_service.get_prompts.return_value = "Test prompt"
    cosmos_service.get_prompt_metadata.return_value = {}
    cosmos_service.update_job_status.return_value = None
    cosmos_service.upsert_job.return_value = None
    mock_cosmos_class.return_value = cosmos_service

    storage_service = Mock()
    storage_service.download_text_from_blob.return_value = "Transcribed text here"
    storage_service.generate_and_upload_docx.return_value = "https://storage.blob.core.windows.net/recordings/test/audio__SYS___reprocess_20260131120000_abc123.docx"
    mock_get_storage.return_value = storage_service

    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "Analysis output"}
    mock_get_analysis.return_value = analysis_service

    payload = {
        "job_id": "job-1",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
    }
    req = func.HttpRequest(method="POST", body=json.dumps(payload).encode(), url="/api/reprocess-analysis")

    # Act
    resp = function_app.reprocess_analysis_http(req)

    # Assert
    assert resp.status_code == 200
    storage_service.generate_and_upload_docx.assert_called_once()
    
    # Extract the blob name that was passed to generate_and_upload_docx
    call_args = storage_service.generate_and_upload_docx.call_args
    blob_name = call_args[0][1]  # Second positional argument is the blob name
    
    # Verify the blob name pattern includes both reprocess and system tag
    assert "_reprocess_" in blob_name, f"Expected '_reprocess_' in blob name: {blob_name}"
    tag = get_system_generated_tag()
    assert tag in blob_name, f"Expected blob name to contain '{tag}' but got: {blob_name}"
    assert tag + "_reprocess_" in blob_name, f"Expected pattern '{tag}_reprocess_' in blob name: {blob_name}"


# =============================================================================
# Modernized Legacy Tests - Updated to Use Current DI Patterns
# =============================================================================

@patch('services.cosmos_service.CosmosService')
@patch('function_app.get_blob_storage_service')
@patch('function_app.get_analysis_service')
def test_reprocess_returns_200_and_processes_synchronously(mock_get_analysis, mock_get_storage, mock_cosmos_class):
    """
    Modernized test using proper DI pattern (CosmosService constructor mock).
    
    Tests that reprocess HTTP endpoint successfully processes a job with valid inputs.
    """
    # Arrange
    cosmos_service = Mock()
    job = {
        "id": "job-1",
        "file_path": "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        "transcription_file_path": "https://storage.blob.core.windows.net/recordings/test/audio__SYS__transcription.txt",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
    }
    cosmos_service.get_job_by_id.return_value = job
    cosmos_service.get_prompts.return_value = "Test prompt"
    cosmos_service.get_prompt_metadata.return_value = {}
    cosmos_service.update_job_status.return_value = None
    cosmos_service.upsert_job.return_value = None
    mock_cosmos_class.return_value = cosmos_service

    storage_service = Mock()
    storage_service.download_text_from_blob.return_value = "Transcribed text here"
    storage_service.generate_and_upload_docx.return_value = "https://storage.blob.core.windows.net/recordings/analysis.docx"
    mock_get_storage.return_value = storage_service

    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "Analysis output"}
    mock_get_analysis.return_value = analysis_service

    payload = {
        "job_id": "job-1",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
    }
    req = func.HttpRequest(method="POST", body=json.dumps(payload).encode(), url="/api/reprocess-analysis")

    # Act
    resp = function_app.reprocess_analysis_http(req)

    # Assert
    assert resp.status_code == 200
    body = json.loads(resp.get_body())
    assert body.get('status') == 'success'
    # Ensure cosmos was marked as analysing
    cosmos_service.update_job_status.assert_called()
    # The upsert_job should be called to persist the new analysis result
    cosmos_service.upsert_job.assert_called()


def test_blob_trigger_skips_tagged_reprocess_artifact():
    """
    Phase 2: Regression test verifying blob trigger skips reprocess artifacts with system tag.
    
    This test ensures that when a reprocess artifact (with __SYS__ tag) is uploaded,
    the blob trigger correctly identifies it as system-generated and short-circuits
    without attempting to process it.
    """
    # Arrange - Simulate blob names with reprocess + system tag pattern
    tagged_blob_names = [
        "test/audio__SYS___reprocess_20260131120000_abc123.docx",
        "audio__SYS___reprocess_20251201093045_def456.docx",
        "folder/subfolder/recording__SYS___reprocess_20260115000000_ghi789.docx",
    ]
    
    # Act & Assert
    for tagged_blob_name in tagged_blob_names:
        # In the actual blob trigger, is_system_generated_file() is called early
        # and the function returns without processing if True
        result = is_system_generated_file(tagged_blob_name)
        assert result is True, f"Expected is_system_generated_file to return True for: {tagged_blob_name}"


@pytest.mark.parametrize("bad_payload", [
    {},
    {"job_id": "nonexistent"},
])
@patch('services.cosmos_service.CosmosService')
def test_reprocess_invalid_payload_returns_error(mock_cosmos_class, bad_payload):
    """
    Test that invalid payloads return appropriate error responses.
    
    Modernized to use proper DI mocking pattern.
    """
    # Arrange
    cosmos_service = Mock()
    cosmos_service.get_job_by_id.return_value = None  # Job not found
    mock_cosmos_class.return_value = cosmos_service
    
    # Create request
    req = func.HttpRequest(method="POST", body=json.dumps(bad_payload).encode(), url="/api/reprocess-analysis")
    
    # Act
    resp = function_app.reprocess_analysis_http(req)
    
    # Assert
    assert resp.status_code in (400, 404)


# =============================================================================
# Phase 3 Tests - Defense-in-Depth Pattern Detection
# =============================================================================

def test_is_reprocess_artifact_detects_patterns():
    """
    Phase 3: Test pattern-based detection of reprocess artifacts.
    
    This test verifies the _is_reprocess_artifact() helper function can detect
    reprocess/analysis artifacts based on naming patterns, providing defense-in-depth
    in case system tags are missing (legacy files or regressions).
    """
    # Positive cases (should be detected as reprocess artifacts)
    assert is_reprocess_artifact("file_reprocess_123.docx")
    assert is_reprocess_artifact("folder/file_reprocess_123.docx")
    assert is_reprocess_artifact("file__SYS___reprocess_123.docx")
    assert is_reprocess_artifact("analysis_output.docx")
    assert is_reprocess_artifact("file_analysis.pdf")
    assert is_reprocess_artifact("test/audio_analysis.docx")
    assert is_reprocess_artifact("FOLDER/FILE_REPROCESS_ABC.DOCX")  # Case insensitive
    
    # Negative cases (should NOT be detected)
    assert not is_reprocess_artifact("normal_file.mp3")
    assert not is_reprocess_artifact("recording.wav")
    assert not is_reprocess_artifact("transcript.txt")
    assert not is_reprocess_artifact("reprocess.txt")  # Not docx/pdf
    assert not is_reprocess_artifact("analysis.txt")  # Not docx/pdf
    assert not is_reprocess_artifact("file.docx")  # No reprocess/analysis pattern


@pytest.mark.asyncio
@patch('services.cosmos_service.CosmosService')
@patch('function_app.get_blob_storage_service')
@patch('function_app.get_analysis_service')
async def test_blob_trigger_defense_in_depth_for_legacy_artifacts(mock_get_analysis, mock_get_storage, mock_cosmos_class):
    """
    Phase 3: Integration test verifying defense-in-depth for legacy untagged artifacts.
    
    This test simulates the complete blob trigger flow when encountering:
    1. Legacy reprocess artifacts without system tags
    2. Manual uploads matching reprocess patterns
    3. Artifacts from regressions where tagging was accidentally removed
    
    Verifies:
    - No Cosmos query is made (early return)
    - No exception is raised
    - Clean skip with logging
    """
    from function_app import _process_blob_with_timeout
    
    # Test various untagged artifact patterns
    test_cases = [
        "recordings/audio_reprocess_20250101_abc.docx",  # Classic reprocess
        "recordings/folder/analysis_output.docx",  # Analysis file
        "recordings/meeting_analysis.pdf",  # PDF analysis
        "recordings/sub/deep/file_reprocess_123.docx",  # Deep folder
    ]
    
    for blob_path in test_cases:
        # Arrange
        mock_blob = Mock(spec=func.InputStream)
        mock_blob.uri = f"https://storage.blob.core.windows.net/{blob_path}"
        mock_blob.name = blob_path
        mock_blob.length = 2048
        
        correlation_id = f"test-correlation-{blob_path.replace('/', '-')}"
        
        mock_cosmos = Mock()
        mock_cosmos_class.return_value = mock_cosmos
        
        # Reset mocks for each test case
        mock_cosmos.reset_mock()
        mock_get_storage.reset_mock()
        mock_get_analysis.reset_mock()
        mock_cosmos_class.reset_mock()
        
        # Act - Call processing function directly (simulates blob trigger internals)
        # Should complete without error
        try:
            await _process_blob_with_timeout(mock_blob, correlation_id, mock_blob.uri, blob_path)
        except Exception as e:
            pytest.fail(f"_process_blob_with_timeout raised unexpected exception for {blob_path}: {e}")
        
        # Assert - No service initialization should occur (early return via pattern detection)
        mock_cosmos_class.assert_not_called()
        mock_get_storage.assert_not_called()
        mock_get_analysis.assert_not_called()


# =============================================================================
# Bug Fix Tests - Verify Original Job Completion on Reprocess
# =============================================================================

@patch('services.cosmos_service.CosmosService')
@patch('function_app.get_blob_storage_service')
@patch('function_app.get_analysis_service')
def test_reprocess_with_create_new_job_marks_original_job_completed(mock_get_analysis, mock_get_storage, mock_cosmos_class):
    """
    BUG FIX: Verify that when create_new_job=True, the original job is marked as COMPLETED.
    
    This test captures the regression where reprocessing with create_new_job=True
    would create a new job but fail to mark the original job as COMPLETED,
    leaving it stuck in ANALYSING or TRANSCRIBED state indefinitely.
    
    Expected behavior:
    - Original job should be marked as COMPLETED via update_job_status()
    - New job should be created and marked as COMPLETED via upsert_job()
    - Both updates should succeed or be logged as warnings (non-fatal)
    """
    # Arrange
    cosmos_service = Mock()
    original_job = {
        "id": "original-job-123",
        "file_path": "https://storage.blob.core.windows.net/recordings/test/audio.mp3",
        "file_name": "audio.mp3",
        "displayname": "Test Recording",
        "transcription_file_path": "https://storage.blob.core.windows.net/recordings/test/audio__SYS__transcription.txt",
        "prompt_subcategory_id": "sub-1",
        "prompt_category_id": "cat-1",
        "user_id": "user-123",
        "user_email": "user@example.com",
        "status": "transcribed",  # Original status before reprocess
    }
    cosmos_service.get_job_by_id.return_value = original_job
    cosmos_service.get_prompts.return_value = "Test prompt"
    cosmos_service.get_prompt_metadata.return_value = {}
    cosmos_service.update_job_status.return_value = None
    cosmos_service.upsert_job.return_value = None
    mock_cosmos_class.return_value = cosmos_service

    storage_service = Mock()
    storage_service.download_text_from_blob.return_value = "Transcribed text here"
    storage_service.generate_and_upload_docx.return_value = "https://storage.blob.core.windows.net/recordings/test/audio__SYS___reprocess_20260131120000_abc123.docx"
    mock_get_storage.return_value = storage_service

    analysis_service = Mock()
    analysis_service.analyze_conversation.return_value = {"analysis_text": "Analysis output"}
    mock_get_analysis.return_value = analysis_service

    payload = {
        "job_id": "original-job-123",
        "prompt_subcategory_id": "sub-2",  # Changed subcategory
        "prompt_category_id": "cat-1",
        "create_new_job": True,  # KEY: Create a new job instead of updating the original
        "user_id": "user-123",
        "user_email": "user@example.com",
        "displayname": "Reprocessed Analysis",
    }
    req = func.HttpRequest(method="POST", body=json.dumps(payload).encode(), url="/api/reprocess-analysis")

    # Act
    resp = function_app.reprocess_analysis_http(req)

    # Assert - Response should be successful
    assert resp.status_code == 200
    response_body = json.loads(resp.get_body())
    assert response_body.get('status') == 'success'
    assert response_body.get('new_job_created') is True
    assert response_body.get('job_id') != "original-job-123"  # Different job IDs
    
    # Assert - Verify the new job was upserted
    cosmos_service.upsert_job.assert_called_once()
    upsert_call_args = cosmos_service.upsert_job.call_args
    upserted_job = upsert_call_args[0][0]
    assert upserted_job["status"] == "completed"
    assert upserted_job["id"] != "original-job-123"
    assert upserted_job["created_by_reprocess_job"] == "original-job-123"
    
    # Assert - CRITICAL FIX: Verify the original job was marked as COMPLETED
    # This is the key assertion that tests the bug fix
    cosmos_service.update_job_status.assert_called()
    update_status_calls = cosmos_service.update_job_status.call_args_list
    
    # Should have at least 2 calls: one for marking as ANALYSING, one for marking as COMPLETED
    assert len(update_status_calls) >= 2, f"Expected at least 2 update calls, got {len(update_status_calls)}"
    
    # Find the call that marks the original job as COMPLETED
    original_job_completion_call = None
    for call in update_status_calls:
        args, kwargs = call
        if args and args[0] == "original-job-123":  # Matches original job ID
            # Check if this call marks it as COMPLETED
            if len(args) > 1 and args[1] == "completed":
                original_job_completion_call = call
                break
    
    assert original_job_completion_call is not None, \
        f"Expected update_job_status to be called with job_id='original-job-123' and status='completed'. " \
        f"Got calls: {update_status_calls}"
    
    # Verify analysis progress flag is cleared
    args, kwargs = original_job_completion_call
    assert kwargs.get('analysis_in_progress') is False, \
        "Expected analysis_in_progress to be False when marking original job as COMPLETED"
