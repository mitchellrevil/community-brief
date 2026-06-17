import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.users import UserRepository


async def async_items(items):
    for item in items:
        yield item


class CosmosStub:
    def __init__(self, container):
        self.container = container
        self.container_names = []

    def get_container(self, name):
        self.container_names.append(name)
        return self.container


@pytest.fixture
def auth_container():
    container = MagicMock()
    container.read_item = AsyncMock()
    container.create_item = AsyncMock()
    container.replace_item = AsyncMock()
    container.delete_item = AsyncMock()
    return container


@pytest.fixture
def cosmos_service(auth_container):
    return CosmosStub(auth_container)


@pytest.fixture
def permission_cache():
    cache = AsyncMock()
    cache.get_users_by_permission = AsyncMock(return_value=None)
    cache.set_users_by_permission = AsyncMock()
    cache.set_user_permission = AsyncMock()
    cache.invalidate_user_cache = AsyncMock()
    cache.invalidate_permission_level_cache = AsyncMock()
    return cache


@pytest.fixture
def repository(cosmos_service, permission_cache):
    return UserRepository(cosmos_service, permission_cache=permission_cache)


@pytest.mark.asyncio
async def test_get_by_id_reads_auth_container(repository, cosmos_service, auth_container):
    auth_container.read_item.return_value = {"id": "user-1", "type": "user", "email": "u@test.com"}

    result = await repository.get_by_id("user-1")

    assert result == {"id": "user-1", "type": "user", "email": "u@test.com"}
    assert cosmos_service.container_names == ["auth"]
    auth_container.read_item.assert_awaited_once_with(item="user-1", partition_key="user-1")


@pytest.mark.asyncio
async def test_get_by_id_returns_none_for_non_user(repository, auth_container):
    auth_container.read_item.return_value = {"id": "job-1", "type": "job"}

    assert await repository.get_by_id("job-1") is None


@pytest.mark.asyncio
async def test_get_by_id_returns_none_when_missing(repository, auth_container):
    auth_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.get_by_id("missing") is None


@pytest.mark.asyncio
async def test_get_by_email_queries_case_insensitive_email(repository, auth_container):
    auth_container.query_items.return_value = async_items(
        [{"id": "user-1", "type": "user", "email": "User@Test.com"}]
    )

    result = await repository.get_by_email("user@test.com")

    assert result["id"] == "user-1"
    _, kwargs = auth_container.query_items.call_args
    assert "LOWER(c.email) = LOWER(@email)" in kwargs["query"]
    assert kwargs["parameters"] == [{"name": "@email", "value": "user@test.com"}]


@pytest.mark.asyncio
async def test_list_returns_items_and_total(repository, auth_container):
    auth_container.query_items.side_effect = [
        async_items([{"id": "user-1", "type": "user"}]),
        async_items([1]),
    ]

    result = await repository.list(limit=25, offset=50)

    assert result["items"] == [{"id": "user-1", "type": "user"}]
    assert result["total"] == 1
    assert result["limit"] == 25
    assert result["offset"] == 50


@pytest.mark.asyncio
async def test_search_returns_page_metadata(repository, auth_container):
    auth_container.query_items.side_effect = [
        async_items([3]),
        async_items([{"id": "user-1", "email": "alpha@test.com", "hashed_password": "pw"}]),
    ]

    result = await repository.search(query="alpha", limit=1, offset=1)

    assert result["total"] == 3
    assert result["has_more"] is True
    assert result["users"][0]["id"] == "user-1"


@pytest.mark.asyncio
async def test_create_uses_auth_container(repository, auth_container):
    user = {"id": "user-1", "type": "user"}
    auth_container.create_item.return_value = user

    assert await repository.create(user) == user
    auth_container.create_item.assert_awaited_once_with(body=user)


@pytest.mark.asyncio
async def test_update_replaces_existing_user(repository, auth_container):
    auth_container.read_item.return_value = {"id": "user-1", "type": "user", "email": "old@test.com"}
    auth_container.replace_item.return_value = {
        "id": "user-1",
        "type": "user",
        "email": "new@test.com",
    }

    result = await repository.update("user-1", {"email": "new@test.com"})

    assert result["email"] == "new@test.com"
    auth_container.replace_item.assert_awaited_once_with(
        item="user-1",
        body={"id": "user-1", "type": "user", "email": "new@test.com"},
    )


@pytest.mark.asyncio
async def test_update_raises_when_user_missing(repository, auth_container):
    auth_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    with pytest.raises(ValueError):
        await repository.update("missing", {"email": "new@test.com"})


@pytest.mark.asyncio
async def test_delete_returns_false_when_missing(repository, auth_container):
    auth_container.delete_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.delete("missing") is False


@pytest.mark.asyncio
async def test_get_by_permission_sanitizes_passwords(repository, auth_container):
    auth_container.query_items.return_value = async_items(
        [{"id": "user-1", "email": "admin@test.com", "hashed_password": "pw"}]
    )

    result = await repository.get_by_permission("Admin")

    assert result == [{"id": "user-1", "email": "admin@test.com"}]
    _, kwargs = auth_container.query_items.call_args
    assert kwargs["parameters"] == [{"name": "@permission", "value": "Admin"}]


def test_normalize_email(repository):
    assert repository._normalize_email("  Test@Example.COM  ") == "test@example.com"
    assert repository._normalize_email(None) is None
    assert repository._normalize_email(123) is None


def test_user_cache_expiration(repository):
    user_id = "user-1"
    user_doc = {"id": user_id, "email": "test@example.com"}
    repository._user_cache_by_id[user_id] = (time.monotonic() - 61, user_doc)

    assert repository._get_cached_user_by_id(user_id) is None
    assert user_id not in repository._user_cache_by_id


def test_user_cache_by_email_expiration(repository):
    email = "test@example.com"
    user_doc = {"id": "user-1", "email": email}
    repository._user_cache_by_email[email] = (time.monotonic() - 61, user_doc)

    assert repository._get_cached_user_by_email(email) is None
    assert email not in repository._user_cache_by_email


@pytest.mark.asyncio
async def test_cache_user_doc(repository):
    user_doc = {"id": "user-1", "email": "test@example.com"}
    await repository._cache_user_doc(user_doc)

    assert repository._get_cached_user_by_id("user-1") == user_doc
    assert repository._get_cached_user_by_email("test@example.com") == user_doc


@pytest.mark.asyncio
async def test_invalidate_user_cache(repository):
    user_doc = {"id": "user-1", "email": "test@example.com"}
    await repository._cache_user_doc(user_doc)

    await repository._invalidate_user_cache(user_id="user-1")

    assert repository._get_cached_user_by_id("user-1") is None
    assert repository._get_cached_user_by_email("test@example.com") is None


@pytest.mark.asyncio
async def test_invalidate_user_cache_by_email(repository):
    user_doc = {"id": "user-1", "email": "test@example.com"}
    await repository._cache_user_doc(user_doc)

    await repository._invalidate_user_cache(email="test@example.com")

    assert repository._get_cached_user_by_email("test@example.com") is None
    assert repository._get_cached_user_by_id("user-1") == user_doc


@pytest.mark.asyncio
async def test_cache_user_permission(repository, permission_cache):
    user_doc = {"id": "user-1", "permission": "admin"}

    await repository._cache_user_permission(user_doc)

    permission_cache.set_user_permission.assert_called_with("user-1", "admin")


@pytest.mark.asyncio
async def test_cache_user_permission_error(repository, permission_cache):
    permission_cache.set_user_permission.side_effect = RuntimeError("Cache error")

    await repository._cache_user_permission({"id": "user-1", "permission": "admin"})


@pytest.mark.asyncio
async def test_invalidate_permission_cache(repository, permission_cache):
    await repository._invalidate_permission_cache(user_id="user-1", permission="admin")

    permission_cache.invalidate_user_cache.assert_called_with("user-1")
    permission_cache.invalidate_permission_level_cache.assert_called_with("admin")


@pytest.mark.asyncio
async def test_invalidate_permission_cache_error(repository, permission_cache):
    permission_cache.invalidate_user_cache.side_effect = RuntimeError("Cache error")

    await repository._invalidate_permission_cache(user_id="user-1")
