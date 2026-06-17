from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.repositories.announcements import AnnouncementRepository


async def async_items(items):
    for item in items:
        yield item


@pytest.fixture
def announcements_container():
    container = MagicMock()
    container.create_item = AsyncMock()
    container.read_item = AsyncMock()
    container.upsert_item = AsyncMock()
    container.delete_item = AsyncMock()
    container.query_items = MagicMock()
    return container


@pytest.fixture
def cosmos_service(announcements_container):
    cosmos = MagicMock()
    cosmos.get_container.return_value = announcements_container
    return cosmos


@pytest.fixture
def repository(cosmos_service):
    return AnnouncementRepository(cosmos_service)


@pytest.mark.asyncio
async def test_create_uses_announcements_container(repository, cosmos_service, announcements_container):
    document = {"id": "ann-1", "type": "announcement"}
    announcements_container.create_item.return_value = document

    result = await repository.create(document)

    assert result == document
    cosmos_service.get_container.assert_called_with("announcements")
    announcements_container.create_item.assert_awaited_once_with(body=document)


@pytest.mark.asyncio
async def test_get_by_id_returns_announcement(repository, announcements_container):
    announcement = {"id": "ann-1", "type": "announcement"}
    announcements_container.read_item.return_value = announcement

    result = await repository.get_by_id("ann-1")

    assert result == announcement
    announcements_container.read_item.assert_awaited_once_with(item="ann-1", partition_key="ann-1")


@pytest.mark.asyncio
async def test_get_by_id_returns_none_when_missing(repository, announcements_container):
    announcements_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.get_by_id("missing") is None


@pytest.mark.asyncio
async def test_update_merges_existing_document(repository, announcements_container):
    announcements_container.read_item.return_value = {
        "id": "ann-1",
        "type": "announcement",
        "title": "Old",
    }
    announcements_container.upsert_item.return_value = {
        "id": "ann-1",
        "type": "announcement",
        "title": "New",
    }

    result = await repository.update("ann-1", {"title": "New"})

    assert result["title"] == "New"
    announcements_container.upsert_item.assert_awaited_once_with(
        body={"id": "ann-1", "type": "announcement", "title": "New"}
    )


@pytest.mark.asyncio
async def test_update_returns_none_when_missing(repository, announcements_container):
    announcements_container.read_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.update("missing", {"title": "New"}) is None
    announcements_container.upsert_item.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_returns_false_when_missing(repository, announcements_container):
    announcements_container.delete_item.side_effect = CosmosResourceNotFoundError(message="missing")

    assert await repository.delete("missing") is False


@pytest.mark.asyncio
async def test_list_applies_filters_limit_offset_and_count(repository, announcements_container):
    announcements_container.query_items.side_effect = [
        async_items([{"id": "ann-1"}]),
        async_items([10]),
    ]

    result = await repository.list(limit=25, offset=50, filters={"is_active": True})

    assert result == {"items": [{"id": "ann-1"}], "total": 10, "limit": 25, "offset": 50}
    item_call = announcements_container.query_items.call_args_list[0]
    assert "OFFSET @offset LIMIT @limit" in item_call.kwargs["query"]
    assert {"name": "@offset", "value": 50} in item_call.kwargs["parameters"]
    assert {"name": "@limit", "value": 25} in item_call.kwargs["parameters"]
    assert {"name": "@is_active", "value": True} in item_call.kwargs["parameters"]


@pytest.mark.asyncio
async def test_get_active_for_user_uses_visibility_parameters(repository, announcements_container):
    announcements_container.query_items.return_value = async_items([{"id": "ann-1"}])

    result = await repository.get_active_for_user(
        now_ms=123,
        user_role="Admin",
        user_id="user-1",
        user_email="user@example.com",
        user_service_areas=["Area"],
    )

    assert result == [{"id": "ann-1"}]
    call_kwargs = announcements_container.query_items.call_args.kwargs
    assert "target_user_ids" in call_kwargs["query"]
    assert {"name": "@now", "value": 123} in call_kwargs["parameters"]
    assert {"name": "@user_role", "value": "Admin"} in call_kwargs["parameters"]
    assert {"name": "@user_service_areas", "value": ["Area"]} in call_kwargs["parameters"]
