from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.api.v1.routes import admin_jobs
from backend_app.app.core.errors.domain import PermissionError, ResourceNotFoundError, ValidationError


@pytest.mark.asyncio
async def test_restore_job_maps_management_result():
    management_service = MagicMock()
    management_service.restore_job = AsyncMock(return_value={"status": "success"})

    result = await admin_jobs.restore_job(
        "j1",
        current_user={"id": "me"},
        management_service=management_service,
    )

    assert result == {"status": "success", "message": "Job j1 restored successfully", "job_id": "j1"}
    management_service.restore_job.assert_awaited_once_with("j1", "me", is_admin=True)


@pytest.mark.asyncio
async def test_restore_job_maps_management_errors():
    management_service = MagicMock()

    management_service.restore_job = AsyncMock(return_value={"status": "error", "message": "not found"})
    with pytest.raises(ResourceNotFoundError):
        await admin_jobs.restore_job("j1", current_user={"id": "me"}, management_service=management_service)

    management_service.restore_job = AsyncMock(return_value={"status": "error", "message": "Access denied"})
    with pytest.raises(PermissionError):
        await admin_jobs.restore_job("j1", current_user={"id": "me"}, management_service=management_service)

    management_service.restore_job = AsyncMock(return_value={"status": "error", "message": "bad input"})
    with pytest.raises(ValidationError):
        await admin_jobs.restore_job("j1", current_user={"id": "me"}, management_service=management_service)


@pytest.mark.asyncio
async def test_permanent_delete_and_trigger_analysis_map_results():
    management_service = MagicMock()
    management_service.permanent_delete_job = AsyncMock(return_value={"status": "success"})
    management_service.trigger_analysis_processing = AsyncMock(
        return_value={"status": "success", "processing_id": "p1"}
    )

    assert (
        await admin_jobs.permanent_delete_job(
            "j2",
            current_user={"id": "me"},
            management_service=management_service,
        )
    )["status"] == "success"
    assert (
        await admin_jobs.trigger_analysis_processing(
            "j3",
            current_user={"id": "me"},
            management_service=management_service,
        )
    )["processing_id"] == "p1"

    management_service.permanent_delete_job.assert_awaited_once_with("j2", "me", is_admin=True)
    management_service.trigger_analysis_processing.assert_awaited_once_with("j3", "me", is_admin=True)


@pytest.mark.asyncio
async def test_admin_read_routes_shape_results_and_errors():
    management_service = MagicMock()
    management_service.get_all_jobs = AsyncMock(return_value={"jobs": [1], "total_count": 1})
    management_service.get_deleted_jobs = AsyncMock(return_value={"deleted_jobs": [2], "total_count": 1})
    management_service.get_my_jobs = AsyncMock(return_value={"status": "success", "jobs": [3], "total_count": 1})

    assert (
        await admin_jobs.get_all_jobs(
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            include_deleted=False,
            user_id=None,
        )
    )["total_count"] == 1
    assert (
        await admin_jobs.get_deleted_jobs(
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            user_id=None,
        )
    )["deleted_jobs"] == [2]
    assert (
        await admin_jobs.get_user_jobs(
            "u1",
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            include_deleted=False,
        )
    )["jobs"] == [3]

    management_service.get_all_jobs = AsyncMock(return_value={"error": "nope"})
    with pytest.raises(ValidationError):
        await admin_jobs.get_all_jobs(
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            include_deleted=False,
            user_id=None,
        )

    management_service.get_deleted_jobs = AsyncMock(return_value={"status": "error", "message": "Access denied"})
    with pytest.raises(PermissionError):
        await admin_jobs.get_deleted_jobs(
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            user_id=None,
        )

    management_service.get_my_jobs = AsyncMock(return_value={"status": "error", "message": "boom"})
    with pytest.raises(ValidationError):
        await admin_jobs.get_user_jobs(
            "u1",
            current_user={"id": "me"},
            management_service=management_service,
            limit=50,
            offset=0,
            include_deleted=False,
        )


@pytest.mark.asyncio
async def test_admin_job_statistics_and_reprocess_blob_routes():
    reprocess_service = AsyncMock()
    reprocess_service.reprocess_blob.return_value = {"status": "success"}

    assert (await admin_jobs.get_job_statistics(current_user={"id": "me"}))["status"] == "success"
    assert (
        await admin_jobs.reprocess_blob(
            "j1",
            current_user={"id": "me"},
            reprocess_service=reprocess_service,
        )
    )["status"] == "success"

    reprocess_service.reprocess_blob.assert_awaited_once_with("j1", {"id": "me"})
