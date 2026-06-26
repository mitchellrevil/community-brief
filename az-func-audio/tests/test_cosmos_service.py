"""
Unit tests for CosmosService.

Tests job CRUD operations, prompt management, session cleanup, and error handling.
"""

import pytest
from unittest.mock import Mock

from services.cosmos_service import CosmosService, CosmosServiceError


def test_cosmos_service_prefers_key_over_default_credential(monkeypatch, app_config, mock_cosmos_client):
    captured = {}
    app_config.cosmos_key = "test-cosmos-key"

    def fake_cosmos_client(*, url, credential):
        captured["url"] = url
        captured["credential"] = credential
        return mock_cosmos_client

    monkeypatch.setattr("services.cosmos_service.CosmosClient", fake_cosmos_client)

    CosmosService(config=app_config)

    assert captured["url"] == app_config.cosmos_endpoint
    assert captured["credential"] == "test-cosmos-key"


@pytest.mark.unit
class TestCosmosServiceJobOperations:
    """Test job-related Cosmos operations."""
    
    def test_get_job_by_id_success(self, cosmos_service, sample_job_data):
        """Should retrieve job by ID."""
        # Setup
        job_id = sample_job_data["id"]
        cosmos_service.jobs_container.read_item = Mock(return_value=sample_job_data)
        
        # Execute
        result = cosmos_service.get_job_by_id(job_id)
        
        # Verify
        assert result["id"] == job_id
        assert result["status"] == "pending"
        cosmos_service.jobs_container.read_item.assert_called_once_with(
            item=job_id, partition_key=job_id
        )
    
    def test_get_job_by_id_not_found(self, cosmos_service):
        """Should return None if job not found."""
        cosmos_service.jobs_container.read_item.side_effect = RuntimeError("Not found")
        
        # Execute & Verify
        with pytest.raises(CosmosServiceError):
            cosmos_service.get_job_by_id("nonexistent-id")

    def test_get_job_by_id_returns_correct_job(self, cosmos_service, sample_job_data):
        """Should return the exact job matching the requested ID.
        
        This tests Phase 4 requirement: get_job_by_id() returns correct job.
        When there are multiple jobs, requesting a specific ID should return 
        exactly that job with all its expected fields.
        """
        # Setup - create a specific job with known fields
        job_id = "specific-job-12345"
        expected_job = {
            "id": job_id,
            "file_path": "https://storage.blob.core.windows.net/recordings/specific-file.mp3",
            "status": "processing",
            "prompt_subcategory_id": "custom-prompt",
            "user_id": "user-abc",
            "created_at": "2025-02-09T10:00:00Z",
            "original_filename": "specific-file.mp3",
        }
        
        cosmos_service.jobs_container.read_item = Mock(return_value=expected_job)
        
        # Execute
        result = cosmos_service.get_job_by_id(job_id)
        
        # Verify - check all fields match exactly
        assert result["id"] == job_id
        assert result["file_path"] == expected_job["file_path"]
        assert result["status"] == expected_job["status"]
        assert result["prompt_subcategory_id"] == expected_job["prompt_subcategory_id"]
        assert result["user_id"] == expected_job["user_id"]
        assert result["created_at"] == expected_job["created_at"]
        assert result["original_filename"] == expected_job["original_filename"]
        
        # Verify correct query was made
        cosmos_service.jobs_container.read_item.assert_called_once_with(
            item=job_id, partition_key=job_id
        )

    def test_get_job_by_id_does_not_confuse_similar_ids(self, cosmos_service):
        """Should not return a different job with a similar ID.
        
        This tests Phase 4 requirement: job lookup returns correct job.
        Even when job IDs are similar, the correct one should be returned.
        """
        # Setup - the container mock returns only when the exact ID matches
        target_job_id = "job-abc-123"
        target_job = {
            "id": target_job_id,
            "status": "completed",
            "file_path": "https://storage/recordings/target.mp3",
        }
        
        def mock_read_item(item, partition_key):
            if item == target_job_id and partition_key == target_job_id:
                return target_job
            raise RuntimeError(f"Job not found: {item}")
        
        cosmos_service.jobs_container.read_item = Mock(side_effect=mock_read_item)
        
        # Execute - request the exact job
        result = cosmos_service.get_job_by_id(target_job_id)
        
        # Verify - got the correct job
        assert result["id"] == target_job_id
        assert result["status"] == "completed"
        
        # Execute - request a similar but different ID should fail
        with pytest.raises(CosmosServiceError):
            cosmos_service.get_job_by_id("job-abc-124")  # Different last digit
    
    def test_get_file_by_blob_url_success(self, cosmos_service, sample_job_data):
        """Should retrieve job by blob URL."""
        # Setup
        blob_url = sample_job_data["file_path"]
        cosmos_service.jobs_container.query_items = Mock(return_value=[sample_job_data])
        
        # Execute
        result = cosmos_service.get_file_by_blob_url(blob_url)
        
        # Verify
        assert result["file_path"] == blob_url
        cosmos_service.jobs_container.query_items.assert_called_once()
        
        # Check query parameters
        call_args = cosmos_service.jobs_container.query_items.call_args
        assert "file_path" in call_args[1]["query"]
    
    def test_get_file_by_blob_url_not_found(self, cosmos_service):
        """Should return None if no job found for blob URL."""
        cosmos_service.jobs_container.query_items = Mock(return_value=[])
        
        # Execute
        result = cosmos_service.get_file_by_blob_url("https://test.blob/missing.mp3")
        
        # Verify
        assert result is None

    def test_get_file_by_blob_url_suffix_fallback(self, cosmos_service, sample_job_data):
        """Should fall back to a suffix-based lookup when exact match fails."""
        blob_url = sample_job_data["file_path"]
        # First query (exact) returns nothing, second (suffix) returns match
        cosmos_service.jobs_container.query_items = Mock(side_effect=[[], [sample_job_data]])

        result = cosmos_service.get_file_by_blob_url(blob_url)

        assert result is not None
        assert result["file_path"] == sample_job_data["file_path"]
        assert cosmos_service.jobs_container.query_items.call_count == 2
    
    def test_update_job_status_success(self, cosmos_service, sample_job_data):
        """Should update job status and additional fields."""
        # Setup
        job_id = sample_job_data["id"]
        cosmos_service.get_job_by_id = Mock(return_value=sample_job_data)
        cosmos_service.jobs_container.upsert_item = Mock(return_value=sample_job_data)
        
        # Execute
        result = cosmos_service.update_job_status(
            job_id, 
            "processing",
            transcription_job_id="trans-123"
        )
        
        # Verify
        assert result["status"] == "processing"
        cosmos_service.jobs_container.upsert_item.assert_called_once()
        
        # Check that updated_at was set
        upserted_item = cosmos_service.jobs_container.upsert_item.call_args.kwargs.get("body")
        assert "updated_at" in upserted_item
    
    def test_update_job_status_job_not_found(self, cosmos_service):
        """Should raise ValueError if job doesn't exist."""
        cosmos_service.get_job_by_id = Mock(return_value=None)
        
        # Execute & Verify
        with pytest.raises(CosmosServiceError, match="Job not found"):
            cosmos_service.update_job_status("missing-id", "processing")
    
    def test_update_job_with_transcription_data(self, cosmos_service, sample_job_data):
        """Should update job with transcription results."""
        # Setup
        job_id = sample_job_data["id"]
        cosmos_service.get_job_by_id = Mock(return_value=sample_job_data)
        cosmos_service.jobs_container.upsert_item = Mock(return_value=sample_job_data)
        
        transcription_text = "This is the transcribed content."
        
        # Execute
        result = cosmos_service.update_job_status(
            job_id,
            "transcribed",
            transcription_text=transcription_text,
            transcription_job_id="trans-456"
        )
        
        # Verify
        upserted_item = cosmos_service.jobs_container.upsert_item.call_args.kwargs.get("body")
        assert upserted_item["transcription_text"] == transcription_text
        assert upserted_item["transcription_job_id"] == "trans-456"
    
    def test_update_job_with_analysis_data(self, cosmos_service, sample_job_data, sample_talking_points):
        """Should update job with analysis results."""
        # Setup
        job_id = sample_job_data["id"]
        cosmos_service.get_job_by_id = Mock(return_value=sample_job_data)
        cosmos_service.jobs_container.upsert_item = Mock(return_value=sample_job_data)
        
        analysis_text = "Analysis summary..."
        
        # Execute
        result = cosmos_service.update_job_status(
            job_id,
            "completed",
            analysis_text=analysis_text,
            talking_points=sample_talking_points
        )
        
        # Verify
        upserted_item = cosmos_service.jobs_container.upsert_item.call_args.kwargs.get("body")
        assert upserted_item["analysis_text"] == analysis_text
        assert upserted_item["talking_points"] == sample_talking_points


@pytest.mark.unit
class TestCosmosServicePromptOperations:
    """Test prompt management operations."""
    
    def test_get_prompts_success(self, cosmos_service):
        """Should retrieve prompt text from a prompt subcategory."""
        prompt_data = {
            "id": "analysis-subcategory",
            "type": "prompt_subcategory",
            "prompts": {
                "v1": "Analyze the following content..."
            }
        }
        cosmos_service.prompts_container.query_items = Mock(return_value=[prompt_data])

        result = cosmos_service.get_prompts("analysis-subcategory")

        assert result == "Analyze the following content..."

    def test_get_prompts_not_found(self, cosmos_service):
        """Should raise if subcategory has no prompts."""
        cosmos_service.prompts_container.query_items = Mock(return_value=[])

        with pytest.raises(CosmosServiceError):
            cosmos_service.get_prompts("missing-subcategory")

    def test_get_prompt_metadata_success(self, cosmos_service):
        """Should return prompt metadata document."""
        prompt_data = {
            "id": "analysis-subcategory",
            "type": "prompt_subcategory",
            "analysis_model": "gpt-5.1",
            "prompts": {"v1": "Analyze..."}
        }
        cosmos_service.prompts_container.query_items = Mock(return_value=[prompt_data])

        result = cosmos_service.get_prompt_metadata("analysis-subcategory")

        assert result["id"] == "analysis-subcategory"
        assert result["analysis_model"] == "gpt-5.1"


@pytest.mark.unit
class TestCosmosServiceErrorHandling:
    """Test error handling and edge cases."""
    
    def test_handles_cosmos_exception_on_read(self, cosmos_service):
        """Should wrap Cosmos exceptions in CosmosServiceError."""
        from azure.cosmos.exceptions import CosmosHttpResponseError
        
        cosmos_service.jobs_container.read_item.side_effect = CosmosHttpResponseError(
            status_code=404,
            message="Not found"
        )
        
        # Execute & Verify
        with pytest.raises(CosmosServiceError):
            cosmos_service.get_job_by_id("test-id")
    
    def test_handles_cosmos_exception_on_query(self, cosmos_service):
        """Should wrap Cosmos exceptions in CosmosServiceError on query."""
        cosmos_service.jobs_container.query_items.side_effect = RuntimeError("Query failed")
        
        # Execute & Verify
        with pytest.raises(CosmosServiceError):
            cosmos_service.get_file_by_blob_url("test-url")
    
    def test_handles_cosmos_exception_on_upsert(self, cosmos_service, sample_job_data):
        """Should wrap Cosmos exceptions in CosmosServiceError on upsert."""
        job_id = sample_job_data["id"]
        cosmos_service.get_job_by_id = Mock(return_value=sample_job_data)
        cosmos_service.jobs_container.upsert_item.side_effect = RuntimeError("Upsert failed")
        
        # Execute & Verify
        with pytest.raises(CosmosServiceError):
            cosmos_service.update_job_status(job_id, "processing")
    
    def test_query_with_cross_partition(self, cosmos_service):
        """Should enable cross-partition queries."""
        cosmos_service.jobs_container.query_items = Mock(return_value=[])
        
        # Execute
        cosmos_service.get_file_by_blob_url("test-url")
        
        # Verify cross-partition query enabled
        call_kwargs = cosmos_service.jobs_container.query_items.call_args[1]
        assert call_kwargs.get("enable_cross_partition_query") is True


@pytest.mark.unit
class TestCosmosServiceDataIntegrity:
    """Test data validation and integrity checks."""

    def test_timestamps_are_updated(self, cosmos_service, sample_job_data):
        """Should update timestamps on job modification."""
        job_id = sample_job_data["id"]
        cosmos_service.get_job_by_id = Mock(return_value=sample_job_data)
        cosmos_service.jobs_container.upsert_item = Mock(return_value=sample_job_data)

        cosmos_service.update_job_status(job_id, "processing")

        upserted_item = cosmos_service.jobs_container.upsert_item.call_args.kwargs.get("body")
        assert "updated_at" in upserted_item
