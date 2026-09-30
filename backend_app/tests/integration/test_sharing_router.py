"""Integration-level checks for job sharing route wiring."""
from unittest.mock import AsyncMock

import pytest


class TestJobSharingRoutes:
    @pytest.mark.asyncio
    async def test_share_route_returns_workflow_response(self):
        from app.api.v1.routes.job_sharing import ShareJobRequest, share_job
        from app.schemas.job_sharing import JobShareResponse

        workflow_service = AsyncMock()
        workflow_service.share_job.return_value = JobShareResponse(
            status="success",
            message="shared",
            sharing_id="share-123",
            permission_level="view",
        )
        request = ShareJobRequest(
            shared_user_email="recipient@test.com",
            permission_level="view",
            message=None,
        )
        current_user = {"id": "owner-1", "email": "owner@test.com"}

        result = await share_job(
            job_id="job-123",
            share_request=request,
            current_user=current_user,
            workflow_service=workflow_service,
        )

        assert result.status == "success"
        assert result.permission_level == "view"
        assert result.sharing_id == "share-123"
        workflow_service.share_job.assert_awaited_once_with(
            job_id="job-123",
            share_request=request,
            current_user=current_user,
        )

    @pytest.mark.asyncio
    async def test_unshare_route_returns_workflow_response(self):
        from app.api.v1.routes.job_sharing import unshare_job

        workflow_service = AsyncMock()
        workflow_service.unshare_job.return_value = {"status": "success"}
        current_user = {"id": "owner-1"}

        result = await unshare_job(
            job_id="job-123",
            shared_user_email="recipient@test.com",
            current_user=current_user,
            workflow_service=workflow_service,
        )

        assert result["status"] == "success"
        workflow_service.unshare_job.assert_awaited_once_with(
            job_id="job-123",
            shared_user_email="recipient@test.com",
            current_user=current_user,
        )

    @pytest.mark.asyncio
    async def test_sharing_info_route_returns_workflow_response(self):
        from app.api.v1.routes.job_sharing import get_job_sharing_info

        workflow_service = AsyncMock()
        workflow_service.get_job_sharing_info.return_value = {
            "status": "success",
            "job_id": "job-123",
            "is_owner": True,
            "total_shares": 2,
            "shared_with": [{"user_id": "user-2"}, {"user_id": "user-3"}],
        }
        current_user = {"id": "owner-1"}

        result = await get_job_sharing_info(
            job_id="job-123",
            current_user=current_user,
            workflow_service=workflow_service,
        )

        assert result["status"] == "success"
        assert result["total_shares"] == 2
        workflow_service.get_job_sharing_info.assert_awaited_once_with(
            job_id="job-123",
            current_user=current_user,
        )

    @pytest.mark.asyncio
    async def test_shared_jobs_route_returns_workflow_response(self):
        from app.api.v1.routes.job_sharing import get_shared_jobs

        workflow_service = AsyncMock()
        workflow_service.get_shared_jobs.return_value = {
            "status": "success",
            "shared_jobs": [{"id": "job-1"}],
            "owned_jobs_shared_with_others": [],
        }
        current_user = {"id": "user-1"}

        result = await get_shared_jobs(
            current_user=current_user,
            workflow_service=workflow_service,
        )

        assert result["status"] == "success"
        assert len(result["shared_jobs"]) == 1
        workflow_service.get_shared_jobs.assert_awaited_once_with(current_user=current_user)
