from typing import Any, Dict, List
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from app.services.announcement_service import (
    AnnouncementService,
    _active_announcements_cache,
    _announcement_by_id_cache,
)


def make_announcement(
    id: str = "announcement_test-123",
    title: str = "Test Announcement",
    is_active: bool = True,
    target_roles: List[str] | None = None,
    start_at: int | None = None,
    end_at: int | None = None,
) -> Dict[str, Any]:
    return {
        "id": id,
        "type": "announcement",
        "title": title,
        "content": "Test content",
        "is_active": is_active,
        "target_roles": target_roles or [],
        "start_at": start_at,
        "end_at": end_at,
        "created_at": 1,
        "updated_at": 1,
    }


@pytest.fixture
def announcement_repository():
    repository = AsyncMock()
    repository.create = AsyncMock()
    repository.get_by_id = AsyncMock()
    repository.update = AsyncMock()
    repository.delete = AsyncMock()
    repository.list = AsyncMock()
    repository.get_active_for_user = AsyncMock()
    return repository


@pytest.fixture
def announcement_service(announcement_repository):
    return AnnouncementService(announcement_repository)


@pytest_asyncio.fixture(autouse=True)
async def clear_announcement_caches():
    await _active_announcements_cache.clear()
    await _announcement_by_id_cache.clear()
    yield
    await _active_announcements_cache.clear()
    await _announcement_by_id_cache.clear()


@pytest.mark.asyncio
class TestCreateAnnouncement:
    async def test_creates_announcement_with_generated_id(self, announcement_service, announcement_repository):
        announcement_data = {"title": "New Announcement", "content": "Content"}
        announcement_repository.create.side_effect = lambda document: document

        result = await announcement_service.create_announcement(announcement_data)

        assert result["id"].startswith("announcement_")
        assert result["type"] == "announcement"
        announcement_repository.create.assert_awaited_once()

    async def test_creates_announcement_with_provided_id(self, announcement_service, announcement_repository):
        announcement_data = {"id": "my-custom-id", "title": "Test", "content": "Content"}
        announcement_repository.create.side_effect = lambda document: document

        result = await announcement_service.create_announcement(announcement_data)

        assert result["id"] == "my-custom-id"

    async def test_sets_created_at_and_updated_at_timestamps(self, announcement_service, announcement_repository):
        announcement_repository.create.side_effect = lambda document: document

        result = await announcement_service.create_announcement({"title": "Test", "content": "Content"})

        assert isinstance(result["created_at"], int)
        assert isinstance(result["updated_at"], int)
        assert result["created_at"] == result["updated_at"]


@pytest.mark.asyncio
class TestGetAnnouncement:
    async def test_returns_announcement_when_found(self, announcement_service, announcement_repository):
        announcement = make_announcement(id="announcement_123")
        announcement_repository.get_by_id.return_value = announcement

        result = await announcement_service.get_announcement("announcement_123")

        assert result == announcement
        announcement_repository.get_by_id.assert_awaited_once_with("announcement_123")

    async def test_returns_none_when_not_found(self, announcement_service, announcement_repository):
        announcement_repository.get_by_id.return_value = None

        result = await announcement_service.get_announcement("nonexistent")

        assert result is None


@pytest.mark.asyncio
class TestUpdateAnnouncement:
    async def test_updates_announcement_and_sets_updated_at(self, announcement_service, announcement_repository):
        updated = make_announcement(id="announcement_123", title="New Title")
        announcement_repository.update.return_value = updated

        result = await announcement_service.update_announcement("announcement_123", {"title": "New Title"})

        assert result == updated
        announcement_repository.update.assert_awaited_once()
        _, update_doc = announcement_repository.update.await_args.args
        assert update_doc["title"] == "New Title"
        assert isinstance(update_doc["updated_at"], int)

    async def test_returns_none_when_not_found(self, announcement_service, announcement_repository):
        announcement_repository.update.return_value = None

        result = await announcement_service.update_announcement("nonexistent", {"title": "New"})

        assert result is None


@pytest.mark.asyncio
class TestDeleteAnnouncement:
    async def test_deletes_announcement_and_returns_true(self, announcement_service, announcement_repository):
        announcement_repository.delete.return_value = True

        result = await announcement_service.delete_announcement("announcement_123")

        assert result is True
        announcement_repository.delete.assert_awaited_once_with("announcement_123")

    async def test_returns_false_when_not_found(self, announcement_service, announcement_repository):
        announcement_repository.delete.return_value = False

        result = await announcement_service.delete_announcement("nonexistent")

        assert result is False


@pytest.mark.asyncio
class TestListAnnouncements:
    async def test_returns_paginated_results(self, announcement_service, announcement_repository):
        expected = {"items": [make_announcement()], "total": 1, "limit": 10, "offset": 0}
        announcement_repository.list.return_value = expected

        result = await announcement_service.list_announcements(limit=10, offset=0)

        assert result == expected
        announcement_repository.list.assert_awaited_once_with(limit=10, offset=0, filters=None)

    async def test_applies_filters(self, announcement_service, announcement_repository):
        announcement_repository.list.return_value = {"items": [], "total": 0, "limit": 10, "offset": 0}

        await announcement_service.list_announcements(limit=10, offset=0, filters={"is_active": True})

        announcement_repository.list.assert_awaited_once_with(
            limit=10,
            offset=0,
            filters={"is_active": True},
        )


@pytest.mark.asyncio
class TestGetActiveAnnouncementsForUser:
    async def test_returns_active_announcements_for_user(self, announcement_service, announcement_repository):
        announcements = [
            make_announcement(id="announcement_1", is_active=True, target_roles=[]),
            make_announcement(id="announcement_2", is_active=True, target_roles=["USER"]),
        ]
        announcement_repository.get_active_for_user.return_value = announcements
        user = {"id": "user_123", "email": "user@example.com", "permission": "USER"}

        result = await announcement_service.get_active_announcements_for_user(user)

        assert result == announcements

    async def test_builds_user_targeting_context(self, announcement_service, announcement_repository):
        announcement_repository.get_active_for_user.return_value = []
        user = {
            "id": "user_123",
            "email": "user@example.com",
            "permission": "ADMIN",
            "business_unit_id": "bu-1",
            "business_unit_ids": ["bu-2"],
            "business_unit_names": ["Service Area"],
        }

        await announcement_service.get_active_announcements_for_user(user)

        call_kwargs = announcement_repository.get_active_for_user.await_args.kwargs
        assert call_kwargs["user_role"] == "ADMIN"
        assert call_kwargs["user_id"] == "user_123"
        assert call_kwargs["user_email"] == "user@example.com"
        assert call_kwargs["user_service_areas"] == ["bu-2", "Service Area", "bu-1"]
        assert isinstance(call_kwargs["now_ms"], int)

    async def test_returns_empty_list_when_no_active_announcements(self, announcement_service, announcement_repository):
        announcement_repository.get_active_for_user.return_value = []
        user = {"id": "user_123", "permission": "USER"}

        result = await announcement_service.get_active_announcements_for_user(user)

        assert result == []


@pytest.mark.asyncio
class TestAnnouncementAcknowledgements:
    async def test_mark_announcement_read_returns_acknowledgement(self, announcement_service, announcement_repository):
        result = await announcement_service.mark_announcement_read("announcement_123", user_id="user_1")

        assert result == {
            "status": "success",
            "message": "Announcement marked as read",
            "announcement_id": "announcement_123",
        }
        announcement_repository.create.assert_not_awaited()
        announcement_repository.update.assert_not_awaited()

    async def test_dismiss_announcement_returns_acknowledgement(self, announcement_service, announcement_repository):
        result = await announcement_service.dismiss_announcement("announcement_123", user_id="user_1")

        assert result == {
            "status": "success",
            "message": "Announcement dismissed",
            "announcement_id": "announcement_123",
        }
        announcement_repository.create.assert_not_awaited()
        announcement_repository.update.assert_not_awaited()
