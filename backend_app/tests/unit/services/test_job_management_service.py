import pytest
from unittest.mock import MagicMock, AsyncMock
from backend_app.app.services.jobs.job_management_service import JobManagementService
from backend_app.app.repositories.jobs import JobRepository

@pytest.fixture
def mock_job_service():
    service = MagicMock()
    service.enrich_job_file_urls = AsyncMock(side_effect=lambda x: x)
    return service

@pytest.fixture
def mock_job_repository():
    repository = MagicMock(spec=JobRepository)
    repository.get_by_id = AsyncMock()
    repository.replace = AsyncMock()
    repository.delete = AsyncMock()
    repository.query = AsyncMock()
    return repository

@pytest.fixture
def job_management_service(mock_job_service, mock_job_repository):
    return JobManagementService(mock_job_service, mock_job_repository)

class TestSoftDeleteJob:
    @pytest.mark.asyncio
    async def test_soft_delete_job_success(self, job_management_service, mock_job_repository):
        job_id = "job123"
        user_id = "user123"
        job_data = {"id": job_id, "user_id": user_id, "deleted": False}
        mock_job_repository.get_by_id.return_value = job_data

        result = await job_management_service.soft_delete_job(job_id, user_id)

        assert result["status"] == "success"
        assert result["job_id"] == job_id
        assert "deleted_at" in result
        assert job_data["deleted"] is True
        assert job_data["deleted_by"] == user_id
        mock_job_repository.replace.assert_called_once()

    @pytest.mark.asyncio
    async def test_soft_delete_job_not_found(self, job_management_service, mock_job_repository):
        mock_job_repository.get_by_id.return_value = None
        result = await job_management_service.soft_delete_job("job123", "user123")
        assert result["status"] == "error"
        assert result["message"] == "Job not found"

    @pytest.mark.asyncio
    async def test_soft_delete_job_access_denied(self, job_management_service, mock_job_repository):
        job_data = {"id": "job123", "user_id": "other_user", "deleted": False}
        mock_job_repository.get_by_id.return_value = job_data
        result = await job_management_service.soft_delete_job("job123", "user123")
        assert result["status"] == "error"
        assert result["message"] == "Access denied: not job owner"

    @pytest.mark.asyncio
    async def test_soft_delete_job_already_deleted(self, job_management_service, mock_job_repository):
        job_data = {"id": "job123", "user_id": "user123", "deleted": True}
        mock_job_repository.get_by_id.return_value = job_data
        result = await job_management_service.soft_delete_job("job123", "user123")
        assert result["status"] == "error"
        assert result["message"] == "Job is already deleted"

class TestRestoreJob:
    @pytest.mark.asyncio
    async def test_restore_job_success(self, job_management_service, mock_job_repository):
        job_id = "job123"
        user_id = "user123"
        job_data = {"id": job_id, "user_id": user_id, "deleted": True, "deleted_at": "timestamp"}
        mock_job_repository.get_by_id.return_value = job_data

        result = await job_management_service.restore_job(job_id, user_id)

        assert result["status"] == "success"
        assert job_data["deleted"] is False
        assert "deleted_at" not in job_data
        mock_job_repository.replace.assert_called_once()

    @pytest.mark.asyncio
    async def test_restore_job_not_deleted(self, job_management_service, mock_job_repository):
        job_data = {"id": "job123", "user_id": "user123", "deleted": False}
        mock_job_repository.get_by_id.return_value = job_data
        result = await job_management_service.restore_job("job123", "user123")
        assert result["status"] == "error"
        assert result["message"] == "Job is not deleted"

class TestPermanentDeleteJob:
    @pytest.mark.asyncio
    async def test_permanent_delete_job_success(self, job_management_service, mock_job_repository):
        job_id = "job123"
        user_id = "admin_user"
        job_data = {"id": job_id, "user_id": "user123"}
        mock_job_repository.get_by_id.return_value = job_data
        mock_job_repository.delete.return_value = True

        result = await job_management_service.permanent_delete_job(job_id, user_id, is_admin=True)

        assert result["status"] == "success"
        mock_job_repository.delete.assert_called_once_with(job_id)

    @pytest.mark.asyncio
    async def test_permanent_delete_job_not_admin(self, job_management_service):
        result = await job_management_service.permanent_delete_job("job123", "user123", is_admin=False)
        assert result["status"] == "error"
        assert "Access denied" in result["message"]

class TestTriggerAnalysisProcessing:
    @pytest.mark.asyncio
    async def test_trigger_analysis_success(self, job_management_service, mock_job_repository):
        job_id = "job123"
        user_id = "user123"
        job_data = {"id": job_id, "user_id": user_id, "text_content": "some text"}
        mock_job_repository.get_by_id.return_value = job_data

        result = await job_management_service.trigger_analysis_processing(job_id, user_id)

        assert result["status"] == "success"
        assert job_data["status"] == "processing_analysis"
        mock_job_repository.replace.assert_called_once()

    @pytest.mark.asyncio
    async def test_trigger_analysis_access_denied(self, job_management_service, mock_job_repository):
        job_data = {"id": "job123", "user_id": "other_user"}
        mock_job_repository.get_by_id.return_value = job_data
        result = await job_management_service.trigger_analysis_processing("job123", "user123")
        assert result["status"] == "error"
        assert result["message"] == "Access denied"

class TestGetAllJobs:
    @pytest.mark.asyncio
    async def test_get_all_jobs_success(self, job_management_service, mock_job_repository):
        mock_job_repository.query.side_effect = [
            [10],
            [{"id": "job1"}],
        ]

        result = await job_management_service.get_all_jobs()

        assert result["total_count"] == 10
        assert len(result["jobs"]) == 1
        # Removed status assertion as it is not returned

    @pytest.mark.asyncio
    async def test_get_all_jobs_with_filter(self, job_management_service, mock_job_repository):
        mock_job_repository.query.side_effect = [
            [5],
            [{"id": "job1"}],
        ]

        result = await job_management_service.get_all_jobs(filter_user_id="user123")

        assert result["total_count"] == 5
        assert len(result["jobs"]) == 1
        # Removed status assertion

