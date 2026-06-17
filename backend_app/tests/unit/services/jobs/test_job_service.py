import pytest
from unittest.mock import MagicMock, AsyncMock
from app.services.jobs.job_service import JobService, invalidate_job_cache, _job_cache
from app.services.jobs.job_route_workflow_service import _jobs_cache
from app.repositories.jobs import JobRepository
from app.services.storage.blob_service import StorageService
from app.core.config import AppConfig

@pytest.fixture
def mock_storage():
    storage = MagicMock(spec=StorageService)
    storage.add_sas_token_to_url = AsyncMock(side_effect=lambda url: f"{url}?sas" if url else None)
    return storage

@pytest.fixture
def mock_job_repository():
    repository = MagicMock(spec=JobRepository)
    repository.get_by_id = AsyncMock()
    repository.query = AsyncMock()
    repository.create = AsyncMock()
    return repository

@pytest.fixture
def mock_config():
    config = MagicMock(spec=AppConfig)
    config.azure_storage_account_url = "https://test.blob.core.windows.net"
    config.azure_storage_key = "test-key"
    config.azure_storage_recordings_container = "recordings"
    return config

@pytest.fixture
def job_service(mock_storage, mock_job_repository):
    return JobService(mock_storage, mock_job_repository)


@pytest.fixture(autouse=True)
async def clear_job_caches():
    await _job_cache.clear()
    await _jobs_cache.clear()
    yield
    await _job_cache.clear()
    await _jobs_cache.clear()

@pytest.mark.asyncio
class TestJobServiceGet:
    async def test_get_job_cache_miss(self, job_service, mock_job_repository):
        job_id = "job-1"
        job_doc = {"id": job_id, "type": "job"}
        mock_job_repository.get_by_id.return_value = job_doc
        
        # Clear cache
        await _job_cache.clear()
        
        result = await job_service.get_job(job_id)
        assert result == job_doc
        mock_job_repository.get_by_id.assert_called_with(job_id)

    async def test_get_job_cache_hit(self, job_service, mock_job_repository):
        job_id = "job-1"
        job_doc = {"id": job_id, "type": "job"}
        
        # Pre-populate cache
        await _job_cache.set(f"job:{job_id}", job_doc)
        
        result = await job_service.get_job(job_id)
        assert result == job_doc
        mock_job_repository.get_by_id.assert_not_called()

    async def test_get_job_error(self, job_service, mock_job_repository):
        job_id = "job-1"
        mock_job_repository.get_by_id.side_effect = RuntimeError("DB Error")
        await _job_cache.clear()
        
        result = await job_service.get_job(job_id)
        assert result is None

@pytest.mark.asyncio
class TestJobServiceFilters:
    async def test_get_jobs_with_filters(self, job_service, mock_job_repository):
        current_user = {"id": "user-1", "permission": "user"}
        
        # Mock query_jobs to return jobs and count
        jobs = [{"id": "job-1", "user_id": "user-1", "file_path": "http://blob/file.wav"}]
        count = [10]
        
        mock_job_repository.query.side_effect = [jobs, count]
        
        result = await job_service.get_jobs_with_filters(
            current_user=current_user,
            limit=5,
            offset=0
        )
        
        assert result["count"] == 10
        assert len(result["jobs"]) == 1
        job = result["jobs"][0]
        assert job["is_owned"] is True
        assert job["user_permission"] == "user"
        assert job["file_path"] == "http://blob/file.wav?sas" # Enriched

    async def test_get_jobs_with_filters_empty(self, job_service, mock_job_repository):
        current_user = {"id": "user-1"}
        mock_job_repository.query.side_effect = [[], []]
        
        result = await job_service.get_jobs_with_filters(current_user=current_user)
        assert result["count"] == 0
        assert result["jobs"] == []

    async def test_compose_query_where_params(self, job_service):
        # Test basic
        sql, params = job_service._compose_query_where_params("user-1", None, None)
        assert "c.user_id = @user_id" in sql
        assert any(p["name"] == "@user_id" and p["value"] == "user-1" for p in params)
        
        # Test with job_id and status
        sql, params = job_service._compose_query_where_params("user-1", "job-1", "completed")
        assert "c.id = @job_id" in sql
        assert "c.status = @status" in sql
        assert any(p["name"] == "@job_id" and p["value"] == "job-1" for p in params)
        assert any(p["name"] == "@status" and p["value"] == "completed" for p in params)

        # Test with created_at range
        start_iso = "2025-01-01T00:00:00+00:00"
        end_iso = "2025-01-01T23:59:59.999000+00:00"
        sql, params = job_service._compose_query_where_params("user-1", None, None, created_at_start=start_iso, created_at_end=end_iso)
        assert "created_at >= @created_at_start" in sql
        assert "created_at <= @created_at_end" in sql
        assert any(p["name"] == "@created_at_start" and p["value"] == start_iso for p in params)
        assert any(p["name"] == "@created_at_end" and p["value"] == end_iso for p in params)

    async def test_compose_query_where_params_no_user(self, job_service):
        with pytest.raises(ValueError):
            job_service._compose_query_where_params(None, None, None)

@pytest.mark.asyncio
class TestEnrichment:
    async def test_enrich_job_file_urls(self, job_service):
        job = {
            "file_path": "http://blob/file.wav",
            "transcription_file_path": "http://blob/trans.txt",
            "analysis_file_path": "http://blob/analysis.txt",
            "file_name": "file.wav"
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert enriched["file_path"] == "http://blob/file.wav?sas"
        assert enriched["transcription_file_path"] == "http://blob/trans.txt?sas"
        assert enriched["analysis_file_path"] == "http://blob/analysis.txt?sas"
        assert enriched["displayname"] == "file.wav"

    async def test_enrich_job_file_urls_defaults(self, job_service):
        job = {"file_path": "http://blob/file.wav"}
        enriched = await job_service.enrich_job_file_urls(job)
        assert enriched["file_name"] == "file.wav"
        assert enriched["displayname"] == "file.wav"

@pytest.mark.asyncio
class TestUploadAndCreate:
    async def test_upload_and_create_job(self, job_service, mock_storage, mock_job_repository):
        mock_storage.upload_file = AsyncMock(return_value="http://blob/original.wav")
        mock_job_repository.create.side_effect = lambda doc: doc
        
        owner = {"id": "user-1", "email": "test@example.com"}
        metadata = {"custom": "data"}
        
        result = await job_service.upload_and_create_job(
            "local/path.wav", "original.wav", owner, metadata
        )
        
        assert result["file_path"] == "http://blob/original.wav?sas" # Enriched
        assert result["user_id"] == "user-1"
        assert result["file_name"] == "original.wav"
        assert result["custom"] == "data"
        assert result["status"] == "uploaded"
        
        mock_storage.upload_file.assert_called_with("local/path.wav", "original.wav")
        mock_job_repository.create.assert_called()

    async def test_upload_and_create_job_invalidates_cached_job_lists(self, job_service, mock_storage, mock_job_repository):
        mock_storage.upload_file = AsyncMock(return_value="http://blob/original.wav")
        mock_job_repository.create.side_effect = lambda doc: doc
        await _jobs_cache.set("jobs:service:user-1:none:none:none:none:12:0", {"status": 200, "jobs": []})

        await job_service.upload_and_create_job(
            "local/path.wav",
            "original.wav",
            {"id": "user-1", "email": "test@example.com"},
        )

        assert await _jobs_cache.get("jobs:service:user-1:none:none:none:none:12:0") is None

    async def test_upload_and_create_job_error(self, job_service, mock_storage, mock_job_repository):
        mock_storage.upload_file = AsyncMock(return_value="http://blob/uploaded.wav")
        mock_job_repository.create.side_effect = RuntimeError("DB Error")
        
        with pytest.raises(Exception):
            await job_service.upload_and_create_job(
                "local/path.wav", "original.wav", {"id": "u1"}
            )

@pytest.mark.asyncio
class TestCreateJobFromBlob:
    async def test_create_job_from_blob_calls_set_blob_metadata(self, job_service, mock_storage, mock_job_repository):
        """Test that create_job_from_blob() calls set_blob_metadata() after job creation."""
        blob_url = "https://storage.blob.core.windows.net/uploads/recording.wav"
        owner = {"id": "user-1", "email": "test@example.com"}
        
        # Mock verify_blob_exists to return a size
        mock_storage.verify_blob_exists = AsyncMock(return_value=1024)
        
        # Create a job doc to return from cosmos.create_job
        job_doc = {
            "id": "job-abc123",
            "type": "job",
            "created_at": "2025-01-01T00:00:00+00:00",
            "user_id": "user-1",
            "user_email": "test@example.com",
            "file_name": "recording.wav",
            "file_path": blob_url,
            "file_size_bytes": 1024,
            "status": "uploaded",
            "upload_method": "direct",
        }
        mock_job_repository.create.return_value = job_doc
        
        # Mock set_blob_metadata to track calls
        mock_storage.set_blob_metadata = AsyncMock(return_value=True)
        
        result = await job_service.create_job_from_blob(blob_url, "recording.wav", owner)
        
        mock_job_repository.create.assert_called_once()
        
        # Verify set_blob_metadata was called with the blob_url and job_id
        mock_storage.set_blob_metadata.assert_called_once()
        args, kwargs = mock_storage.set_blob_metadata.call_args
        assert args[0] == blob_url
        assert "job_id" in args[1]
        assert args[1]["job_id"] == "job-abc123"
        
        # Job creation should still succeed even if metadata write is called
        assert result["id"] == "job-abc123"

    async def test_create_job_from_blob_metadata_write_failure_does_not_fail_job(self, job_service, mock_storage, mock_job_repository):
        """Test that job creation succeeds even if set_blob_metadata() fails."""
        blob_url = "https://storage.blob.core.windows.net/uploads/recording.wav"
        owner = {"id": "user-1", "email": "test@example.com"}
        
        mock_storage.verify_blob_exists = AsyncMock(return_value=1024)
        
        job_doc = {
            "id": "job-abc123",
            "type": "job",
            "created_at": "2025-01-01T00:00:00+00:00",
            "user_id": "user-1",
            "user_email": "test@example.com",
            "file_name": "recording.wav",
            "file_path": blob_url,
            "file_size_bytes": 1024,
            "status": "uploaded",
            "upload_method": "direct",
        }
        mock_job_repository.create.return_value = job_doc
        
        # Mock set_blob_metadata to return False (failure)
        mock_storage.set_blob_metadata = AsyncMock(return_value=False)
        
        # Should NOT raise, job creation should still succeed
        result = await job_service.create_job_from_blob(blob_url, "recording.wav", owner)
        
        assert result["id"] == "job-abc123"
        mock_storage.set_blob_metadata.assert_called_once()

@pytest.mark.asyncio
class TestMisc:
    async def test_invalidate_job_cache(self):
        job_id = "job-1"
        await _job_cache.set(f"job:{job_id}", {})
        await _jobs_cache.set("jobs:test", {"status": 200})
        await invalidate_job_cache(job_id)
        assert await _job_cache.get(f"job:{job_id}") is None
        assert await _jobs_cache.get("jobs:test") is None

    async def test_close(self, job_service):
        # Should just log
        job_service.close()
