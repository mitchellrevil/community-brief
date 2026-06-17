from unittest.mock import AsyncMock

import pytest

from backend_app.app.api.v1.routes import job_sharing as sharing_router
from backend_app.app.schemas.job_sharing import JobShareResponse, ShareJobRequest


@pytest.mark.asyncio
async def test_share_job_delegates_to_workflow_service():
    workflow_service = AsyncMock()
    share_request = ShareJobRequest(shared_user_email="t@e.com", permission_level="view", message=None)
    workflow_service.share_job.return_value = JobShareResponse(
        status="success",
        message="shared",
        sharing_id="s1",
        permission_level="view",
    )

    response = await sharing_router.share_job(
        "j1",
        share_request,
        current_user={"id": "me"},
        workflow_service=workflow_service,
    )

    assert response.status == "success"
    assert response.sharing_id == "s1"
    workflow_service.share_job.assert_awaited_once_with(
        job_id="j1",
        share_request=share_request,
        current_user={"id": "me"},
    )


@pytest.mark.asyncio
async def test_unshare_get_info_and_shared_jobs_delegate_to_workflow_service():
    workflow_service = AsyncMock()
    workflow_service.unshare_job.return_value = {"status": "success"}
    workflow_service.get_job_sharing_info.return_value = {"status": "success", "job_id": "j1"}
    workflow_service.get_shared_jobs.return_value = {"status": "success", "shared_jobs": []}

    assert (
        await sharing_router.unshare_job(
            "j1",
            "t@e.com",
            current_user={"id": "me"},
            workflow_service=workflow_service,
        )
    )["status"] == "success"
    assert (
        await sharing_router.get_job_sharing_info(
            "j1",
            current_user={"id": "me"},
            workflow_service=workflow_service,
        )
    )["job_id"] == "j1"
    assert (
        await sharing_router.get_shared_jobs(
            current_user={"id": "me"},
            workflow_service=workflow_service,
        )
    )["status"] == "success"

    workflow_service.unshare_job.assert_awaited_once_with(
        job_id="j1",
        shared_user_email="t@e.com",
        current_user={"id": "me"},
    )
    workflow_service.get_job_sharing_info.assert_awaited_once_with(
        job_id="j1",
        current_user={"id": "me"},
    )
    workflow_service.get_shared_jobs.assert_awaited_once_with(current_user={"id": "me"})
