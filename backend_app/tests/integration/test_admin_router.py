"""Integration-level checks for admin job route wiring."""
from unittest.mock import AsyncMock, MagicMock

import pytest


class TestAdminJobRoutes:
    @pytest.mark.asyncio
    async def test_restore_permanent_delete_and_reprocess_routes_delegate(self):
        from app.api.v1.routes.admin_jobs import (
            permanent_delete_job,
            restore_job,
            trigger_analysis_processing,
        )

        workflow = AsyncMock()
        workflow.restore_job.return_value = {"status": "success", "job_id": "job-1"}
        workflow.permanent_delete_job.return_value = {"status": "success", "job_id": "job-1"}
        workflow.trigger_analysis_processing.return_value = {"status": "success", "processing_id": "proc-1"}
        current_user = {"id": "admin-1", "permission": "Admin"}

        assert (
            await restore_job(job_id="job-1", current_user=current_user, workflow_service=workflow)
        )["job_id"] == "job-1"
        assert (
            await permanent_delete_job(job_id="job-1", current_user=current_user, workflow_service=workflow)
        )["status"] == "success"
        assert (
            await trigger_analysis_processing(job_id="job-1", current_user=current_user, workflow_service=workflow)
        )["processing_id"] == "proc-1"

        workflow.restore_job.assert_awaited_once_with(job_id="job-1", current_user=current_user)
        workflow.permanent_delete_job.assert_awaited_once_with(job_id="job-1", current_user=current_user)
        workflow.trigger_analysis_processing.assert_awaited_once_with(job_id="job-1", current_user=current_user)

    @pytest.mark.asyncio
    async def test_admin_read_routes_delegate(self):
        from app.api.v1.routes.admin_jobs import get_all_jobs, get_deleted_jobs, get_user_jobs

        workflow = AsyncMock()
        workflow.get_all_jobs.return_value = {"status": "success", "jobs": []}
        workflow.get_deleted_jobs.return_value = {"status": "success", "deleted_jobs": []}
        workflow.get_user_jobs.return_value = {"status": "success", "user_id": "target-user"}
        current_user = {"id": "admin-1", "permission": "Admin"}

        await get_all_jobs(
            current_user=current_user,
            workflow_service=workflow,
            limit=50,
            offset=0,
            include_deleted=True,
            user_id="target-user",
        )
        await get_deleted_jobs(
            current_user=current_user,
            workflow_service=workflow,
            limit=50,
            offset=0,
            user_id="target-user",
        )
        await get_user_jobs(
            user_id="target-user",
            current_user=current_user,
            workflow_service=workflow,
            limit=50,
            offset=0,
            include_deleted=False,
        )

        workflow.get_all_jobs.assert_awaited_once_with(
            limit=50,
            offset=0,
            include_deleted=True,
            user_id="target-user",
        )
        workflow.get_deleted_jobs.assert_awaited_once_with(
            current_user=current_user,
            limit=50,
            offset=0,
            user_id="target-user",
        )
        workflow.get_user_jobs.assert_awaited_once_with(
            user_id="target-user",
            limit=50,
            offset=0,
            include_deleted=False,
        )

    @pytest.mark.asyncio
    async def test_stats_route_delegates(self):
        from app.api.v1.routes.admin_jobs import get_job_statistics

        workflow = MagicMock()
        workflow.get_job_statistics.return_value = {"status": "success", "stats": {}}

        result = await get_job_statistics(current_user={"id": "admin-1"}, workflow_service=workflow)

        assert result["status"] == "success"
        workflow.get_job_statistics.assert_called_once_with()
