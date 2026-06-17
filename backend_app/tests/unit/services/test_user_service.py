from unittest.mock import AsyncMock, MagicMock

import pytest

from backend_app.app.core.errors.domain import ApplicationError, ErrorCode
from backend_app.app.services.users.user_service import UserService


def build_service(*, repository=None, prompt_service=None) -> UserService:
    repo = repository or MagicMock()
    prompt = prompt_service or MagicMock()
    return UserService(prompt, repo)


def async_users(*users):
    async def iterator():
        for user in users:
            yield user

    return iterator()


def test_normalize_and_sanitize_helpers():
    svc = build_service()

    assert svc._normalize_business_units(None) == []
    assert svc._normalize_business_units({"business_unit_ids": ["a", None, "b"]}) == ["a", "b"]
    assert svc._normalize_business_units({"business_unit_id": "solo"}) == []

    sanitized = svc._sanitize_user({"id": "u1", "email": "a@b.com", "hashed_password": "secret"})
    assert "hashed_password" not in sanitized


@pytest.mark.asyncio
async def test_create_user_conflict_raises():
    repository = MagicMock()
    repository.get_by_email = AsyncMock(return_value={"id": "exists"})
    svc = build_service(repository=repository)

    with pytest.raises(ApplicationError) as ctx:
        await svc.create_user(email="e@x.com", password_hash="p")

    assert ctx.value.error_code == ErrorCode.RESOURCE_CONFLICT


@pytest.mark.asyncio
async def test_list_get_search_and_basic_crud():
    repository = MagicMock()
    repository.list = AsyncMock(
        return_value={"items": [{"id": "u1", "hashed_password": "x", "email": "a@b.com"}], "total": 1}
    )
    repository.get_by_email = AsyncMock(return_value={"id": "u2", "hashed_password": "p", "email": "b@c.com"})
    repository.get_by_id = AsyncMock(return_value={"id": "u2", "hashed_password": "p", "email": "b@c.com"})
    repository.search = AsyncMock(
        return_value={
            "users": [{"id": "s1", "email": "s1@x.com", "hashed_password": "pw"}],
            "total": 1,
            "limit": 10,
            "offset": 0,
            "has_more": False,
        }
    )
    repository.create = AsyncMock(return_value={"id": "new", "email": "n@x.com", "hashed_password": "h"})
    repository.update = AsyncMock(return_value={"id": "u3", "hashed_password": "h"})
    repository.delete = AsyncMock(return_value=True)
    repository.get_by_permission = AsyncMock(return_value=[{"id": "u1", "hashed_password": "pw"}])
    svc = build_service(repository=repository)

    listed = await svc.list_users(limit=10, offset=0)
    assert listed["total"] == 1
    assert "hashed_password" not in listed["items"][0]
    repository.list.assert_awaited_once_with(limit=10, offset=0)

    by_email = await svc.get_user_by_email("b@c.com")
    assert by_email["email"] == "b@c.com"
    assert "hashed_password" not in by_email

    by_id = await svc.get_user("u2")
    assert by_id["id"] == "u2"

    search = await svc.search_users(query="s", limit=10, offset=0)
    assert search["total"] == 1
    assert "hashed_password" not in search["users"][0]

    repository.get_by_email.return_value = None
    created = await svc.create_user(email="n@x.com", password_hash="h")
    assert created["email"] == "n@x.com"
    assert "hashed_password" not in created

    repository.update.side_effect = ValueError("not found")
    with pytest.raises(Exception):
        await svc.update_user("nope", {})

    repository.update.side_effect = None
    repository.update.return_value = {"id": "u3", "hashed_password": "h"}
    updated = await svc.update_user("u3", {})
    assert updated["id"] == "u3"

    await svc.update_user_password("u3", "newhash")
    await svc.delete_user("u3")

    users_by_permission = await svc.get_users_by_permission("admin")
    assert isinstance(users_by_permission, list)
    assert "hashed_password" not in users_by_permission[0]


@pytest.mark.asyncio
async def test_self_assign_and_set_and_bulk_update():
    prompt_service = MagicMock()
    prompt_service.get_categories_by_ids = AsyncMock(return_value={"b1": {"name": "BU1"}})
    repository = MagicMock()
    repository.update = AsyncMock(return_value={"id": "u1", "business_unit_ids": ["b1"]})
    repository.get_by_id = AsyncMock(return_value={"id": "u1"})
    svc = build_service(repository=repository, prompt_service=prompt_service)

    with pytest.raises(Exception):
        await svc.self_assign_business_units(user={"id": "u1"}, business_unit_ids=[])

    with pytest.raises(Exception):
        await svc.self_assign_business_units(user={}, business_unit_ids=["b1"])

    with pytest.raises(Exception):
        await svc.self_assign_business_units(user={"id": "u1", "business_unit_ids": ["b0"]}, business_unit_ids=["b1"])

    result = await svc.set_user_business_units(target_user_id="u1", business_unit_ids=["b1"])
    assert result["business_unit_ids"] == ["b1"]

    update = MagicMock()
    update.user_ids = ["a", "b"]
    update.permission = "Admin"
    update.business_unit_ids = None
    update.add_business_units = None
    update.remove_business_units = None
    repository.get_by_id = AsyncMock(return_value={"id": "a"})
    repository.update = AsyncMock(side_effect=[{"id": "a"}, RuntimeError("fail")])

    output = await svc.bulk_update_users(update)

    assert output["failed_count"] == 1


@pytest.mark.asyncio
async def test_remove_and_refresh_business_unit_cleanup():
    repository = MagicMock()
    repository.iter_all = MagicMock(
        return_value=async_users(
            {"id": "u1", "business_unit_ids": ["b1", "b2"]},
            {"id": "u2", "business_unit_ids": ["b2"]},
        )
    )
    repository.update = AsyncMock(return_value=True)

    prompt_service = MagicMock()
    prompt_service.get_categories_by_ids = AsyncMock(return_value={"b2": {"name": "BU2"}})

    svc = build_service(repository=repository, prompt_service=prompt_service)

    updated_count = await svc.remove_business_unit_from_users("b1")
    assert updated_count == 1
    repository.update.assert_awaited_once()
    args = repository.update.call_args[0]
    assert args[0] == "u1"
    assert args[1]["business_unit_ids"] == ["b2"]
    assert args[1]["business_unit_names"] == ["BU2"]

    repository.iter_all = MagicMock(
        return_value=async_users(
            {"id": "u1", "business_unit_ids": ["b1", "b2"]},
            {"id": "u3", "business_unit_ids": ["b1"]},
        )
    )
    repository.update = AsyncMock(return_value=True)
    prompt_service.get_categories_by_ids = AsyncMock(
        return_value={
            "b1": {"name": "BU1"},
            "b2": {"name": "BU2"},
        }
    )

    refreshed = await svc.refresh_business_unit_names("b1")

    assert refreshed == 2
    assert repository.update.await_count == 2
