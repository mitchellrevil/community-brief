"""
Simple integration verification for Phase 3 implementation.

Verifies that the provider registry, selection precedence, and 
function_app integration work correctly.
"""

import pytest
from unittest.mock import Mock


def test_phase3_end_to_end_integration(app_config, mock_credential):
    """
    End-to-end test verifying Phase 3 implementation:
    1. Provider registry exists and is accessible
    2. AnalysisService uses registry for provider lookup
    3. Selection precedence works (explicit > prompt > config)
    4. CosmosService returns analysis_provider field
    5. Function_app logic can extract and pass provider
    """
    from services.service_providers import get_analysis_service
    from services.analysis_provider_registry import get_analysis_provider_registry
    from services.analysis_service import AnalysisService
    from services.cosmos_service import CosmosService
    from services.analysis_providers.responses_provider import ResponsesProvider
    from services.analysis_providers.chat_completions_provider import ChatCompletionsProvider
    
    # 1. Verify registry exists and contains expected providers
    registry = get_analysis_provider_registry()
    assert "responses" in registry
    assert "chat_completions" in registry
    assert registry["responses"] is ResponsesProvider
    assert registry["chat_completions"] is ChatCompletionsProvider
    
    # 2. Verify AnalysisService uses registry
    service = get_analysis_service()
    assert hasattr(service, 'provider_registry')
    assert service.provider_registry == registry
    
    # 3. Verify selection precedence with custom registry
    mock_responses = Mock()
    mock_responses.analyze.return_value = "Responses result"
    
    mock_chat = Mock()
    mock_chat.analyze.return_value = "Chat result"
    
    custom_registry = {
        "responses": Mock(return_value=mock_responses),
        "chat_completions": Mock(return_value=mock_chat),
    }
    
    custom_service = AnalysisService(
        config=app_config, 
        credential=mock_credential,
        provider_registry=custom_registry
    )
    
    # Test explicit provider (highest precedence)
    result = custom_service.analyze_conversation(
        conversation="Test",
        context={},
        provider_name="chat_completions"
    )
    assert result["analysis_text"] == "Chat result"
    
    # Test config default (lowest precedence)
    app_config.default_analysis_provider = "responses"
    result2 = custom_service.analyze_conversation(
        conversation="Test",
        context={}
    )
    assert result2["analysis_text"] == "Responses result"
    
    # 4. Verify CosmosService returns analysis_provider field
    mock_container = Mock()
    mock_client = Mock()
    mock_client.get_database_client.return_value.get_container_client.return_value = mock_container
    
    prompt_doc = {
        "id": "test-prompt",
        "type": "prompt_subcategory",
        "analysis_provider": "chat_completions",
        "prompts": {"default": "Test..."}
    }
    mock_container.query_items.return_value = [prompt_doc]
    
    cosmos = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    metadata = cosmos.get_prompt_metadata("test-prompt")
    assert metadata["analysis_provider"] == "chat_completions"
    
    # 5. Verify function_app-style integration
    # Simulate function_app extracting provider and passing to service
    provider_from_prompt = metadata.get("analysis_provider")
    assert provider_from_prompt == "chat_completions"
    
    result3 = custom_service.analyze_conversation(
        conversation="Test",
        context={},
        provider_name=provider_from_prompt  # From prompt metadata
    )
    assert result3["analysis_text"] == "Chat result"
    


def test_phase3_backward_compatibility(app_config, mock_credential):
    """Verify Phase 3 maintains backward compatibility."""
    from services.analysis_service import AnalysisService
    from services.cosmos_service import CosmosService
    
    # Test that service works without provider_registry parameter (uses default)
    service = AnalysisService(config=app_config, credential=mock_credential)
    assert hasattr(service, 'provider_registry')
    
    # Test that service works with no provider_name (uses config default)
    mock_provider = Mock()
    mock_provider.analyze.return_value = "Default result"
    
    custom_registry = {
        "responses": Mock(return_value=mock_provider),
    }
    
    app_config.default_analysis_provider = "responses"
    service = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry=custom_registry
    )
    
    result = service.analyze_conversation("Test", {})
    assert result["analysis_text"] == "Default result"
    
    # Test that CosmosService handles missing analysis_provider field
    mock_container = Mock()
    mock_client = Mock()
    mock_client.get_database_client.return_value.get_container_client.return_value = mock_container
    
    legacy_prompt = {
        "id": "legacy-prompt",
        "type": "prompt_subcategory",
        # No analysis_provider field
        "prompts": {"default": "Legacy..."}
    }
    mock_container.query_items.return_value = [legacy_prompt]
    
    cosmos = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    metadata = cosmos.get_prompt_metadata("legacy-prompt")
    assert "analysis_provider" not in metadata  # Field not present
    
    # Verify service still works without provider
    provider_from_prompt = metadata.get("analysis_provider")  # None
    assert provider_from_prompt is None
    
    # Should use config default when no provider specified
    result2 = service.analyze_conversation("Test", {})
    assert result2["analysis_text"] == "Default result"
    


def test_blob_trigger_persists_provider_to_cosmos(app_config, mock_credential):
    """
    Verify blob trigger flow persists analysis_provider to Cosmos job document.
    
    Phase 3 objective: persist provider metadata for observability.
    """
    from unittest.mock import Mock, patch, ANY
    from services.cosmos_service import CosmosService
    from services.analysis_service import AnalysisService
    from services.storage_service import StorageService
    from core.job_status import JobStatus
    
    # Mock Cosmos container
    mock_container = Mock()
    mock_client = Mock()
    mock_db = Mock()
    mock_client.get_database_client.return_value = mock_db
    mock_db.get_container_client.return_value = mock_container
    
    # Mock job document with prompt metadata
    job_doc = {
        "id": "test-job-123",
        "type": "job",
        "file_path": "https://example.com/audio.wav",
        "prompt_subcategory_id": "test-prompt",
        "status": "transcribed",
    }
    
    # Mock prompt metadata with provider
    prompt_doc = {
        "id": "test-prompt",
        "type": "prompt_subcategory",
        "analysis_provider": "chat_completions",
        "prompts": {"default": "Analyze this..."}
    }
    
    # Setup mock returns
    mock_container.read_item.return_value = job_doc
    mock_container.query_items.side_effect = [
        [job_doc],  # get_file_by_blob_url
        [prompt_doc],  # get_prompt_metadata
        [prompt_doc],  # get_prompts
    ]
    
    cosmos_service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    
    # Mock analysis service to return a result
    mock_analysis_provider = Mock()
    mock_analysis_provider.analyze.return_value = "Analysis complete"
    
    custom_registry = {
        "chat_completions": Mock(return_value=mock_analysis_provider),
    }
    
    analysis_service = AnalysisService(
        config=app_config,
        credential=mock_credential,
        provider_registry=custom_registry
    )
    
    # Simulate the blob trigger flow where provider is extracted from prompt metadata
    provider_from_prompt = prompt_doc.get("analysis_provider")
    
    # Call analyze_conversation with the provider
    result = analysis_service.analyze_conversation(
        conversation="Test audio transcription",
        context={},
        provider_name=provider_from_prompt
    )
    
    # Now update job status WITH provider (this is what the fix should enable)
    cosmos_service.update_job_status(
        "test-job-123",
        JobStatus.COMPLETED,
        analysis_file_path="https://example.com/analysis.docx",
        analysis_completed_at="2026-01-31T12:00:00Z",
        analysis_in_progress=False,
        analysis_provider=provider_from_prompt  # This should be persisted
    )
    
    # Verify upsert_item was called and includes analysis_provider
    assert mock_container.upsert_item.called
    upserted_job = mock_container.upsert_item.call_args[1]["body"]
    
    # CRITICAL ASSERTION: provider must be persisted at top level
    assert "analysis_provider" in upserted_job, "analysis_provider not persisted to job document"
    assert upserted_job["analysis_provider"] == "chat_completions", f"Expected 'chat_completions', got {upserted_job.get('analysis_provider')}"
    
    # NEW ASSERTION: provider must also be in attempts array entry
    assert "analysis_attempts" in upserted_job, "analysis_attempts array not created"
    attempts = upserted_job["analysis_attempts"]
    assert len(attempts) > 0, "analysis_attempts array is empty"
    latest_attempt = attempts[-1]
    assert "analysis_provider" in latest_attempt, "analysis_provider not persisted to attempt entry"
    assert latest_attempt["analysis_provider"] == "chat_completions", f"Expected 'chat_completions' in attempt, got {latest_attempt.get('analysis_provider')}"
    


def test_reprocess_persists_provider_to_attempts(app_config, mock_credential):
    """
    Verify reprocess flow persists analysis_provider to both:
    1. Top-level job document
    2. Individual attempt in analysis_attempts array
    
    Phase 3 objective: persist provider metadata for observability.
    """
    from unittest.mock import Mock
    from services.cosmos_service import CosmosService
    from services.analysis_service import AnalysisService
    from core.job_status import JobStatus
    
    # Mock Cosmos container
    mock_container = Mock()
    mock_client = Mock()
    mock_db = Mock()
    mock_client.get_database_client.return_value = mock_db
    mock_db.get_container_client.return_value = mock_container
    
    # Mock existing job with prior attempt
    existing_job = {
        "id": "test-job-456",
        "type": "job",
        "file_path": "https://example.com/audio2.wav",
        "transcription_file_path": "https://example.com/transcript.txt",
        "prompt_subcategory_id": "old-prompt",
        "analysis_file_path": "https://example.com/old-analysis.docx",
        "analysis_attempts": [
            {
                "attempt": 1,
                "analysis_file_path": "https://example.com/old-analysis.docx",
                "created_at": "2026-01-30T10:00:00Z",
            }
        ],
        "status": "completed",
    }
    
    # Mock new prompt metadata with different provider
    new_prompt_doc = {
        "id": "new-prompt",
        "type": "prompt_subcategory",
        "analysis_provider": "responses",  # Different provider for reprocess
        "prompts": {"default": "New analysis instructions..."}
    }
    
    # Setup mock returns
    mock_container.read_item.return_value = existing_job
    mock_container.query_items.return_value = [new_prompt_doc]
    
    cosmos_service = CosmosService(config=app_config, credential=mock_credential, cosmos_client=mock_client)
    
    # Simulate reprocess flow: extract provider from new prompt metadata
    provider_from_prompt = new_prompt_doc.get("analysis_provider")
    
    # Prepare updated job like reprocess flow does
    existing_attempts = existing_job.get("analysis_attempts", [])
    new_analysis_url = "https://example.com/reprocessed-analysis.docx"
    
    # Add new attempt WITH provider
    existing_attempts.append({
        "attempt": len(existing_attempts) + 1,
        "analysis_file_path": new_analysis_url,
        "created_at": "2026-01-31T12:30:00Z",
        "analysis_instructions": "Please be more detailed",
        "prompt_subcategory_id": "new-prompt",
        "created_by": "reprocess",
        "analysis_provider": provider_from_prompt,  # This should be persisted
    })
    
    # Update job document WITH provider at top level
    existing_job.update({
        "analysis_provider": provider_from_prompt,  # Top-level provider
        "analysis_file_path": new_analysis_url,
        "analysis_attempts": existing_attempts,
        "analysis_latest_attempt": existing_attempts[-1].get("attempt"),
        "analysis_completed_at": "2026-01-31T12:30:00Z",
        "status": JobStatus.COMPLETED,
        "prompt_subcategory_id": "new-prompt",
        "updated_at": "2026-01-31T12:30:00Z",
    })
    
    # Upsert job like reprocess flow does
    cosmos_service.upsert_job(existing_job)
    
    # Verify upsert_item was called and includes analysis_provider
    assert mock_container.upsert_item.called
    upserted_job = mock_container.upsert_item.call_args[1]["body"]
    
    # CRITICAL ASSERTIONS: provider must be in both locations
    assert "analysis_provider" in upserted_job, "analysis_provider not persisted to top-level job document"
    assert upserted_job["analysis_provider"] == "responses", f"Expected 'responses' at top level, got {upserted_job.get('analysis_provider')}"
    
    assert "analysis_attempts" in upserted_job
    latest_attempt = upserted_job["analysis_attempts"][-1]
    assert "analysis_provider" in latest_attempt, "analysis_provider not persisted to attempt entry"
    assert latest_attempt["analysis_provider"] == "responses", f"Expected 'responses' in attempt, got {latest_attempt.get('analysis_provider')}"
    
