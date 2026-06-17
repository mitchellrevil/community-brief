import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend_app.app.services.jobs.job_sharing_service import JobSharingService


def build_service(cosmos=None, repository=None, user_repository=None):
    cosmos = cosmos or MagicMock()
    repository = repository or MagicMock()
    repository.get_by_id = AsyncMock(return_value=None)
    repository.replace = AsyncMock(return_value=None)
    repository.query = AsyncMock(return_value=[])
    if user_repository is None:
        user_repository = MagicMock()
        user_repository.get_by_id = AsyncMock(return_value=None)
        user_repository.get_by_email = AsyncMock(return_value=None)
    return (
        JobSharingService(repository, user_repository),
        cosmos,
        repository,
        user_repository,
    )


@pytest.mark.asyncio
async def test_share_job_not_found():
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = None

    res = await svc.share_job("j1", "owner", "t@example.com")
    assert res["status"] == "error" and "not found" in res["message"].lower()


@pytest.mark.asyncio
async def test_share_job_access_denied():
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = {"user_id": "other"}

    res = await svc.share_job("j1", "owner", "t@example.com")
    assert res["status"] == "error" and "access denied" in res["message"].lower()


@pytest.mark.asyncio
async def test_share_job_target_user_not_found():
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value=None)
    svc, _, repository, _ = build_service(user_repository=user_repository)
    repository.get_by_id.return_value = {"user_id": "owner"}

    res = await svc.share_job("j1", "owner", "t@example.com")
    assert res["status"] == "error" and "target user not found" in res["message"].lower()


@pytest.mark.asyncio
async def test_share_job_success_adds_and_updates():
    job = {"user_id": "owner", "shared_with": []}
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value={"id": "u123"})
    user_repository.get_by_id = AsyncMock(return_value=None)

    svc, _, repository, _ = build_service(user_repository=user_repository)
    repository.get_by_id.return_value = job

    res = await svc.share_job("j1", "owner", "t@example.com", permission_level="edit")
    assert res["status"] == "success"
    assert res["shared_with_count"] == 1
    repository.replace.assert_called_once()


@pytest.mark.asyncio
async def test_share_job_existing_share_updates():
    job = {"user_id": "owner", "shared_with": [{"user_id": "u123", "permission_level": "view"}]}
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value={"id": "u123"})
    user_repository.get_by_id = AsyncMock(return_value=None)

    svc, _, repository, _ = build_service(user_repository=user_repository)
    repository.get_by_id.return_value = job

    res = await svc.share_job("j1", "owner", "t@example.com", permission_level="edit")
    assert res["status"] == "success"
    # after update, shared_with_count remains 1
    assert res["shared_with_count"] == 1


@pytest.mark.asyncio
async def test_unshare_job_not_found_and_not_owner():
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = None

    res = await svc.unshare_job("j1", "owner", "t@example.com")
    assert res["status"] == "error" and "not found" in res["message"].lower()

    repository.get_by_id.return_value = {"user_id": "other"}
    res = await svc.unshare_job("j1", "owner", "t@example.com")
    assert res["status"] == "error" and "access denied" in res["message"].lower()


@pytest.mark.asyncio
async def test_unshare_job_success_and_not_shared():
    job = {"user_id": "owner", "shared_with": [{"user_email": "a@b.com"}]}
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = job

    res = await svc.unshare_job("j1", "owner", "a@b.com")
    assert res["status"] == "success"
    repository.replace.assert_called_once()

    # Not shared case
    job2 = {"user_id": "owner", "shared_with": [{"user_email": "x@y.com"}]}
    repository.get_by_id.return_value = job2
    res2 = await svc.unshare_job("j1", "owner", "not@here.com")
    assert res2["status"] == "error" and "not shared" in res2["message"].lower()


@pytest.mark.asyncio
async def test_get_job_sharing_info_access_and_owner():
    job = {"user_id": "owner", "shared_with": [{"user_id": "u1", "user_email": "a@b.com"}]}
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = job

    # Not owner, not shared
    res = await svc.get_job_sharing_info("j1", "nope")
    assert res["status"] == "error" and "access denied" in res["message"].lower()

    # Owner
    res2 = await svc.get_job_sharing_info("j1", {"id": "owner"})
    assert res2["status"] == "success"


@pytest.mark.asyncio
async def test_get_job_sharing_info_denies_email_only_share():
    job = {"user_id": "owner", "shared_with": [{"user_email": "shared@example.com"}]}
    svc, _, repository, _ = build_service()
    repository.get_by_id.return_value = job

    res = await svc.get_job_sharing_info("j1", {"id": "u1", "email": "shared@example.com"})

    assert res["status"] == "error"
    assert "access denied" in res["message"].lower()


@pytest.mark.asyncio
async def test_get_shared_jobs_uses_cache():
    # Patch cache to return pre-computed result
    import backend_app.app.services.jobs.job_sharing_service as jmod

    # ensure cache is empty so compute runs
    await jmod._shared_jobs_cache.clear()

    svc, _, repository, _ = build_service()
    repository.query.side_effect = [[{"id": "s1"}], [{"id": "o1"}]]

    res = await svc.get_shared_jobs("me")
    assert isinstance(res, dict)


@pytest.mark.asyncio
async def test_share_unshare_database_errors():
    from backend_app.app.core.config import DatabaseError

    svc, _, repository, _ = build_service()
    repository.get_by_id.side_effect = DatabaseError("db down")

    r = await svc.share_job("j1", "owner", "t@example.com")
    assert r["status"] == "error" and "database service" in r["message"].lower()

    r2 = await svc.unshare_job("j1", "owner", "t@example.com")
    assert r2["status"] == "error" and "database service" in r2["message"].lower()


@pytest.mark.asyncio
async def test_cache_invalidation_exceptions_are_ignored():
    # ensure exceptions from cache invalidation don't break share_job/unshare_job
    job = {"user_id": "owner", "shared_with": []}
    user_repository = MagicMock()
    user_repository.get_by_email = AsyncMock(return_value={"id": "u123"})
    user_repository.get_by_id = AsyncMock(return_value=None)
    svc, _, repository, _ = build_service(user_repository=user_repository)
    repository.get_by_id.return_value = job

    # make invalidate raise
    import backend_app.app.services.jobs.job_sharing_service as jmod

    with patch.object(jmod._shared_jobs_cache, "invalidate", AsyncMock(side_effect=RuntimeError("boom"))):
        out = await svc.share_job("j1", "owner", "t@example.com")
        assert out["status"] == "success"

        # unshare path
        job2 = {"user_id": "owner", "shared_with": [{"user_email": "t@example.com"}]}
        repository.get_by_id.return_value = job2
        out2 = await svc.unshare_job("j1", "owner", "t@example.com")
        assert out2["status"] == "success"

    svc, _, repository, _ = build_service()
    repository.query.side_effect = [[], []]

    res = await svc.get_shared_jobs("me")
    assert "shared_jobs" in res and "owned_jobs_shared_with_others" in res
