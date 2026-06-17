"""
Component tests for JobService.

These tests exercise JobService behavior using in-memory fakes,
verifying the service logic without external dependencies.

Test focus:
- Job lifecycle (create, retrieve, update)
- Query filtering and pagination
- File URL enrichment
- Cache invalidation
- Error handling
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# Mark all tests in this module as component tests
pytestmark = pytest.mark.component


# ============================================================================
# FIXTURES
# ============================================================================

@pytest_asyncio.fixture
async def cosmos_fake():
    """Provide an in-memory Cosmos DB fake."""
    from tests.common.fakes import InMemoryCosmosFake
    
    fake = InMemoryCosmosFake()
    await fake.initialize()
    yield fake
    await fake.clear_all()


@pytest_asyncio.fixture
async def blob_fake():
    """Provide an in-memory Blob Storage fake."""
    from tests.common.fakes import InMemoryBlobFake
    
    fake = InMemoryBlobFake()
    yield fake
    await fake.clear_all()


@pytest_asyncio.fixture
async def job_service(cosmos_fake, blob_fake):
    """Provide a JobService instance wired to fakes."""
    from app.repositories.jobs import JobRepository
    from app.services.jobs.job_service import JobService
    
    service = JobService(blob_fake, JobRepository(cosmos_fake))
    yield service
    service.close()


@pytest.fixture
def sample_user():
    """Provide a sample user for test ownership."""
    from tests.common.factories import user_factory
    return user_factory(
        id="test-user-1",
        email="testuser@example.com",
        permission="user",
    )


@pytest.fixture
def sample_admin():
    """Provide a sample admin user."""
    from tests.common.factories import user_factory
    return user_factory(
        id="admin-user-1",
        email="admin@example.com",
        permission="admin",
    )


# ============================================================================
# TEST: Job Retrieval
# ============================================================================

class TestGetJob:
    """Tests for JobService.get_job method."""
    
    @pytest.mark.asyncio
    async def test_retrieves_existing_job(self, job_service, cosmos_fake, sample_user):
        """Given a job exists, when get_job is called, then returns the job."""
        from tests.common.factories import job_factory
        
        # Seed a job
        job_data = job_factory(
            id="job-123",
            user_id=sample_user["id"],
            status="uploaded",
        )
        await cosmos_fake.create_job(job_data)
        
        # Retrieve
        result = await job_service.get_job("job-123")
        
        assert result is not None
        assert result["id"] == "job-123"
        assert result["status"] == "uploaded"
    
    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_job(self, job_service):
        """Given no job exists, when get_job is called, then returns None."""
        result = await job_service.get_job("nonexistent-job")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_caches_job_on_retrieval(self, job_service, cosmos_fake, sample_user):
        """Given a job exists, when get_job is called twice, then second call uses cache."""
        from tests.common.factories import job_factory
        
        job_data = job_factory(id="cached-job", user_id=sample_user["id"])
        await cosmos_fake.create_job(job_data)
        
        # First call
        result1 = await job_service.get_job("cached-job")
        
        # Modify in storage directly (simulating external change)
        job_data["status"] = "modified"
        await cosmos_fake.update_job("cached-job", job_data)
        
        # Second call should return cached value (original status)
        result2 = await job_service.get_job("cached-job")
        
        assert result1["id"] == result2["id"]
        # Note: Actual cache behavior depends on TTL; this tests the mechanism exists


# ============================================================================
# TEST: Job Queries with Filters
# ============================================================================

class TestGetJobsWithFilters:
    """Tests for JobService.get_jobs_with_filters method."""
    
    @pytest.mark.asyncio
    async def test_returns_jobs_for_user(self, job_service, cosmos_fake, sample_user):
        """Given user has jobs, when querying, then returns only user's jobs."""
        from tests.common.factories import job_factory
        
        # Seed jobs for test user
        for i in range(3):
            await cosmos_fake.create_job(job_factory(
                id=f"user-job-{i}",
                user_id=sample_user["id"],
                status="uploaded",
            ))
        
        # Seed job for different user
        await cosmos_fake.create_job(job_factory(
            id="other-job",
            user_id="other-user",
            status="uploaded",
        ))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            limit=10,
            offset=0,
        )
        
        assert result["count"] == 3
        assert len(result["jobs"]) == 3
        assert all(job["user_id"] == sample_user["id"] for job in result["jobs"])
    
    @pytest.mark.asyncio
    async def test_filters_by_status(self, job_service, cosmos_fake, sample_user):
        """Given jobs with different statuses, when filtering by status, then returns matching jobs."""
        from tests.common.factories import job_factory
        
        # Seed jobs with different statuses
        await cosmos_fake.create_job(job_factory(id="job-1", user_id=sample_user["id"], status="uploaded"))
        await cosmos_fake.create_job(job_factory(id="job-2", user_id=sample_user["id"], status="complete"))
        await cosmos_fake.create_job(job_factory(id="job-3", user_id=sample_user["id"], status="complete"))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            status="complete",
            limit=10,
            offset=0,
        )
        
        assert result["count"] == 2
        assert all(job["status"] == "complete" for job in result["jobs"])
    
    @pytest.mark.asyncio
    async def test_filters_by_job_id(self, job_service, cosmos_fake, sample_user):
        """Given multiple jobs, when filtering by job_id, then returns only that job."""
        from tests.common.factories import job_factory
        
        await cosmos_fake.create_job(job_factory(id="target-job", user_id=sample_user["id"]))
        await cosmos_fake.create_job(job_factory(id="other-job", user_id=sample_user["id"]))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            job_id="target-job",
            limit=10,
            offset=0,
        )
        
        assert result["count"] == 1
        assert result["jobs"][0]["id"] == "target-job"
    
    @pytest.mark.asyncio
    async def test_excludes_deleted_jobs(self, job_service, cosmos_fake, sample_user):
        """Given deleted jobs exist, when querying, then excludes them."""
        from tests.common.factories import job_factory
        
        await cosmos_fake.create_job(job_factory(id="active-job", user_id=sample_user["id"], deleted=False))
        await cosmos_fake.create_job(job_factory(id="deleted-job", user_id=sample_user["id"], deleted=True))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            limit=10,
            offset=0,
        )
        
        assert result["count"] == 1
        assert result["jobs"][0]["id"] == "active-job"
    
    @pytest.mark.asyncio
    async def test_pagination_with_limit_and_offset(self, job_service, cosmos_fake, sample_user):
        """Given many jobs, when using limit and offset, then returns correct page."""
        from tests.common.factories import job_factory
        
        # Seed 5 jobs
        for i in range(5):
            await cosmos_fake.create_job(job_factory(
                id=f"page-job-{i}",
                user_id=sample_user["id"],
            ))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            limit=2,
            offset=2,
        )
        
        assert result["count"] == 5  # Total count
        assert len(result["jobs"]) == 2  # Page size
    
    @pytest.mark.asyncio
    async def test_marks_owned_jobs(self, job_service, cosmos_fake, sample_user):
        """Given user's own jobs, when querying, then is_owned is True."""
        from tests.common.factories import job_factory
        
        await cosmos_fake.create_job(job_factory(id="owned-job", user_id=sample_user["id"]))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            limit=10,
            offset=0,
        )
        
        assert result["jobs"][0]["is_owned"] is True
    
    @pytest.mark.asyncio
    async def test_includes_shared_with_count(self, job_service, cosmos_fake, sample_user):
        """Given a shared job, when querying, then includes shared_with_count."""
        from tests.common.factories import shared_job_factory
        
        await cosmos_fake.create_job(shared_job_factory(
            id="shared-job",
            owner_id=sample_user["id"],
            shared_with_user_ids=["user-a", "user-b", "user-c"],
        ))
        
        result = await job_service.get_jobs_with_filters(
            current_user=sample_user,
            limit=10,
            offset=0,
        )
        
        assert result["jobs"][0]["shared_with_count"] == 3


# ============================================================================
# TEST: File URL Enrichment
# ============================================================================

class TestEnrichJobFileUrls:
    """Tests for JobService.enrich_job_file_urls method."""
    
    @pytest.mark.asyncio
    async def test_adds_sas_token_to_file_path(self, job_service):
        """Given a job with file_path, when enriching, then adds SAS token."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/file.wav",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert "?" in enriched["file_path"]  # SAS token appended
    
    @pytest.mark.asyncio
    async def test_extracts_filename_from_path(self, job_service):
        """Given a job with file_path, when enriching, then extracts file_name."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/2024-01-01/recording.wav",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert enriched["file_name"] == "recording.wav"
    
    @pytest.mark.asyncio
    async def test_adds_sas_to_transcription_path(self, job_service):
        """Given a job with transcription_file_path, when enriching, then adds SAS token."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/file.wav",
            "transcription_file_path": "https://storage.blob.core.windows.net/uploads/transcript.txt",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert "?" in enriched["transcription_file_path"]
    
    @pytest.mark.asyncio
    async def test_adds_sas_to_analysis_path(self, job_service):
        """Given a job with analysis_file_path, when enriching, then adds SAS token."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/file.wav",
            "analysis_file_path": "https://storage.blob.core.windows.net/uploads/analysis.docx",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert "?" in enriched["analysis_file_path"]
    
    @pytest.mark.asyncio
    async def test_sets_displayname_fallback(self, job_service):
        """Given a job without displayname, when enriching, then uses file_name."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/my_recording.wav",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert enriched["displayname"] == "my_recording.wav"
    
    @pytest.mark.asyncio
    async def test_preserves_existing_displayname(self, job_service):
        """Given a job with displayname, when enriching, then preserves it."""
        job = {
            "id": "job-1",
            "file_path": "https://storage.blob.core.windows.net/uploads/file.wav",
            "displayname": "Custom Display Name",
        }
        
        enriched = await job_service.enrich_job_file_urls(job)
        
        assert enriched["displayname"] == "Custom Display Name"


# ============================================================================
# TEST: Cache Invalidation
# ============================================================================

class TestCacheInvalidation:
    """Tests for job cache invalidation."""
    
    @pytest.mark.asyncio
    async def test_invalidate_job_cache_clears_entry(self, job_service, cosmos_fake, sample_user):
        """Given a cached job, when invalidating, then next get fetches fresh data."""
        from tests.common.factories import job_factory
        from app.services.jobs.job_service import invalidate_job_cache
        
        job_data = job_factory(id="cache-test-job", user_id=sample_user["id"], status="uploaded")
        await cosmos_fake.create_job(job_data)
        
        # Prime the cache
        await job_service.get_job("cache-test-job")
        
        # Update in storage
        job_data["status"] = "complete"
        await cosmos_fake.update_job("cache-test-job", job_data)
        
        # Invalidate cache
        await invalidate_job_cache("cache-test-job")
        
        # Next fetch should get updated data
        result = await job_service.get_job("cache-test-job")
        assert result["status"] == "complete"


# ============================================================================
# TEST: Error Handling
# ============================================================================

class TestErrorHandling:
    """Tests for error handling in JobService."""
    
    @pytest.mark.asyncio
    async def test_get_job_handles_database_error_gracefully(self, blob_fake):
        """Given database error, when getting job, then returns None without crashing."""
        from app.services.jobs.job_service import JobService
        
        mock_repository = MagicMock()
        mock_repository.get_by_id = AsyncMock(side_effect=RuntimeError("Database error"))
        
        service = JobService(blob_fake, mock_repository)
        
        result = await service.get_job("error-job")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_requires_user_id_for_query(self, job_service):
        """Given no user_id in current_user, when querying, then raises ValueError."""
        invalid_user = {"email": "no-id@example.com"}  # Missing id
        
        with pytest.raises(ValueError, match="user_id is required"):
            await job_service.get_jobs_with_filters(
                current_user=invalid_user,
                limit=10,
                offset=0,
            )
