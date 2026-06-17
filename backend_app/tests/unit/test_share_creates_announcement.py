import pytest
from unittest.mock import AsyncMock, MagicMock

from backend_app.app.repositories.jobs import JobRepository
from backend_app.app.services.jobs.job_sharing_service import JobSharingService


@pytest.mark.asyncio
async def test_share_creates_announcement_even_if_announcement_throws():
    job = {"user_id": "owner", "shared_with": []}
    cosmos = MagicMock()
    repository = MagicMock(spec=JobRepository)
    repository.get_by_id = AsyncMock(return_value=job)
    repository.replace = AsyncMock(return_value=None)
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value={"id": "u123", "email": "t@example.com"})
    user_repository.get_by_id = AsyncMock(return_value={"id": "owner", "email": "owner@example.com"})

    announcement_service = MagicMock()
    # Simulate announcement creation raising when awaited - share_job should still succeed
    announcement_service.create_announcement = AsyncMock(side_effect=RuntimeError("announce failed"))

    svc = JobSharingService(
        job_repository=repository,
        user_repository=user_repository,
        announcement_service=announcement_service,
    )

    res = await svc.share_job("j1", "owner", "t@example.com", permission_level="edit", message="here")
    assert res["status"] == "success"

    # Ensure announcement_service.create_announcement was invoked once with expected payload keys
    announcement_service.create_announcement.assert_called_once()
    payload = announcement_service.create_announcement.call_args[0][0]

    assert "title" in payload
    assert "message" in payload
    assert "target_user_emails" in payload and isinstance(payload["target_user_emails"], list)
    assert "t@example.com" in payload["target_user_emails"]
    assert "link" in payload
    assert "metadata" in payload

    md = payload["metadata"]
    assert md.get("job_id") == "j1"
    assert md.get("shared_by") == "owner"
    assert md.get("permission_level") == "edit"
    assert isinstance(md.get("shared_at"), int)
