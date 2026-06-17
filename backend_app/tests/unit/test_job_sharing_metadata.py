import pytest
from unittest.mock import AsyncMock, MagicMock

from app.repositories.jobs import JobRepository
from app.services.jobs.job_sharing_service import JobSharingService


@pytest.mark.asyncio
async def test_share_persists_message_and_shared_by_email():
    # Arrange: mock cosmos service
    cosmos = AsyncMock()
    job = {"id": "job-1", "user_id": "owner-1", "type": "job", "status": "completed"}
    target_user = {"id": "target-1", "email": "target@example.com"}
    owner_user = {"id": "owner-1", "email": "owner@example.com"}

    repository = MagicMock(spec=JobRepository)
    repository.get_by_id = AsyncMock(return_value=job)
    repository.replace = AsyncMock()
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value=target_user)
    user_repository.get_by_id = AsyncMock(return_value=owner_user)

    svc = JobSharingService(
        job_repository=repository,
        user_repository=user_repository,
    )

    # Act
    res = await svc.share_job(
        job_id="job-1",
        owner_user_id="owner-1",
        target_user_email="target@example.com",
        permission_level="edit",
        message="Please review"
    )

    # Assert
    assert res["status"] == "success"
    repository.replace.assert_called_once()
    # Inspect the job that was written back to the DB
    called_args = repository.replace.call_args[0]
    assert called_args[0] == "job-1"
    updated_job = called_args[1]
    assert isinstance(updated_job.get("shared_with"), list)
    share = updated_job["shared_with"][0]
    assert share.get("message") == "Please review"
    assert share.get("shared_by_email") == "owner@example.com"
    assert isinstance(share.get("shared_at"), int)
