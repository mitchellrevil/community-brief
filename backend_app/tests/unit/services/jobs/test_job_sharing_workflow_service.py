from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.core.errors.domain import ApplicationError, PermissionError, ResourceNotFoundError
from backend_app.app.schemas.job_sharing import ShareJobRequest
from backend_app.app.services.jobs.job_sharing_workflow_service import JobSharingWorkflowService


def _workflow(
    *,
    sharing_service: MagicMock | None = None,
    job_service: MagicMock | None = None,
    permissions: MagicMock | None = None,
) -> JobSharingWorkflowService:
    return JobSharingWorkflowService(
        sharing_service=sharing_service or MagicMock(),
        job_service=job_service or MagicMock(),
        permissions=permissions or MagicMock(),
    )


@pytest.mark.asyncio
async def test_share_job_checks_access_and_maps_success():
    sharing_service = MagicMock()
    sharing_service.share_job = AsyncMock(return_value={"status": "success", "sharing_id": "s1"})
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    permissions = MagicMock()
    permissions.check_job_access = AsyncMock(return_value=True)

    response = await _workflow(
        sharing_service=sharing_service,
        job_service=job_service,
        permissions=permissions,
    ).share_job(
        job_id="j1",
        share_request=ShareJobRequest(shared_user_email="t@e.com", permission_level="view", message=None),
        current_user={"id": "me"},
    )

    assert response.status == "success"
    assert response.sharing_id == "s1"
    permissions.check_job_access.assert_awaited_once_with({"id": "j1"}, {"id": "me"}, "admin")
    sharing_service.share_job.assert_awaited_once_with(
        job_id="j1",
        owner_user_id="me",
        target_user_email="t@e.com",
        permission_level="view",
        message=None,
    )


@pytest.mark.asyncio
async def test_share_job_raises_for_missing_job_permission_and_service_errors():
    sharing_service = MagicMock()
    job_service = MagicMock()
    permissions = MagicMock()
    workflow = _workflow(sharing_service=sharing_service, job_service=job_service, permissions=permissions)
    request = ShareJobRequest(shared_user_email="t@e.com", permission_level="view")

    job_service.get_job = AsyncMock(return_value=None)
    with pytest.raises(ResourceNotFoundError):
        await workflow.share_job(job_id="j2", share_request=request, current_user={"id": "me"})

    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    permissions.check_job_access = AsyncMock(return_value=False)
    with pytest.raises(PermissionError):
        await workflow.share_job(job_id="j1", share_request=request, current_user={"id": "me"})

    permissions.check_job_access = AsyncMock(return_value=True)
    sharing_service.share_job = AsyncMock(return_value={"status": "error", "message": "Target user not found"})
    with pytest.raises(ResourceNotFoundError):
        await workflow.share_job(job_id="j1", share_request=request, current_user={"id": "me"})

    sharing_service.share_job = AsyncMock(return_value={"status": "error", "message": "Already shared"})
    with pytest.raises(ApplicationError):
        await workflow.share_job(job_id="j1", share_request=request, current_user={"id": "me"})


@pytest.mark.asyncio
async def test_unshare_info_and_shared_jobs_shape_service_results():
    sharing_service = MagicMock()
    sharing_service.unshare_job = AsyncMock(return_value={"status": "success"})
    sharing_service.get_job_sharing_info = AsyncMock(
        return_value={
            "status": "success",
            "sharing_info": {
                "is_owner": False,
                "shared_with": [{"user_id": "me", "permission_level": "edit"}],
                "shared_with_count": 1,
            },
        }
    )
    sharing_service.get_shared_jobs = AsyncMock(
        return_value={"shared_jobs": [1], "owned_jobs_shared_with_others": [2]}
    )
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    permissions = MagicMock()
    permissions.check_job_access = AsyncMock(return_value=True)
    workflow = _workflow(sharing_service=sharing_service, job_service=job_service, permissions=permissions)

    assert (
        await workflow.unshare_job(job_id="j1", shared_user_email="t@e.com", current_user={"id": "me"})
    )["status"] == "success"
    info = await workflow.get_job_sharing_info(job_id="j1", current_user={"id": "me"})
    assert info["user_permission"] == "edit"
    assert info["total_shares"] == 1
    shared = await workflow.get_shared_jobs(current_user={"id": "me"})
    assert shared["status"] == "success"
    assert "Found 1 jobs shared with you" in shared["message"]


@pytest.mark.asyncio
async def test_unshare_and_shared_jobs_raise_for_invalid_service_results():
    sharing_service = MagicMock()
    sharing_service.unshare_job = AsyncMock(return_value={"status": "error", "message": "not found"})
    sharing_service.get_shared_jobs = AsyncMock(return_value=[])
    job_service = MagicMock()
    job_service.get_job = AsyncMock(return_value={"id": "j1"})
    permissions = MagicMock()
    permissions.check_job_access = AsyncMock(return_value=True)
    workflow = _workflow(sharing_service=sharing_service, job_service=job_service, permissions=permissions)

    with pytest.raises(ResourceNotFoundError):
        await workflow.unshare_job(job_id="j1", shared_user_email="t@e.com", current_user={"id": "me"})

    with pytest.raises(ApplicationError):
        await workflow.get_shared_jobs(current_user={"id": "me"})
