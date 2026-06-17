"""Unit tests for admin announcement route behavior."""
from unittest.mock import AsyncMock

import pytest

from app.core.errors.domain import ResourceNotFoundError
from app.schemas.announcements import AnnouncementCreate, AnnouncementUpdate


@pytest.mark.asyncio
async def test_list_announcements_builds_active_filter_and_shapes_response():
    from app.api.v1.routes.admin_announcements import list_announcements

    announcement_service = AsyncMock()
    announcement_service.list_announcements.return_value = {
        "items": [{"id": "ann_1"}],
        "total": 1,
        "limit": 50,
        "offset": 0,
    }

    result = await list_announcements(
        limit=50,
        offset=0,
        is_active=True,
        _current_user={"id": "admin_1"},
        announcement_service=announcement_service,
    )

    assert result == {
        "status": "success",
        "items": [{"id": "ann_1"}],
        "total": 1,
        "limit": 50,
        "offset": 0,
    }
    announcement_service.list_announcements.assert_awaited_once_with(
        limit=50,
        offset=0,
        filters={"is_active": True},
    )


@pytest.mark.asyncio
async def test_get_announcement_shapes_response():
    from app.api.v1.routes.admin_announcements import get_announcement

    announcement_service = AsyncMock()
    announcement_service.get_announcement.return_value = {"id": "ann_123"}

    result = await get_announcement(
        announcement_id="ann_123",
        _current_user={"id": "admin_1"},
        announcement_service=announcement_service,
    )

    assert result == {"status": "success", "announcement": {"id": "ann_123"}}
    announcement_service.get_announcement.assert_awaited_once_with("ann_123")


@pytest.mark.asyncio
async def test_create_announcement_adds_creator():
    from app.api.v1.routes.admin_announcements import create_announcement

    announcement_service = AsyncMock()
    announcement_service.create_announcement.return_value = {"id": "ann_new"}
    current_user = {"id": "admin_1"}
    request = AnnouncementCreate(title="New Announcement", message="Content here", is_active=True)

    result = await create_announcement(
        request=request,
        current_user=current_user,
        announcement_service=announcement_service,
    )

    assert result["announcement"] == {"id": "ann_new"}
    announcement_service.create_announcement.assert_awaited_once_with(
        {
            "title": "New Announcement",
            "message": "Content here",
            "announcement_type": "info",
            "priority": 0,
            "is_active": True,
            "target_roles": [],
            "target_service_areas": [],
            "start_at": None,
            "end_at": None,
            "created_by": "admin_1",
        }
    )


@pytest.mark.asyncio
async def test_update_announcement_adds_updater_and_omits_none():
    from app.api.v1.routes.admin_announcements import update_announcement

    announcement_service = AsyncMock()
    announcement_service.update_announcement.return_value = {"id": "ann_123", "title": "Updated Title"}
    current_user = {"id": "admin_1"}
    request = AnnouncementUpdate(title="Updated Title")

    result = await update_announcement(
        announcement_id="ann_123",
        request=request,
        current_user=current_user,
        announcement_service=announcement_service,
    )

    assert result["announcement"]["title"] == "Updated Title"
    announcement_service.update_announcement.assert_awaited_once_with(
        announcement_id="ann_123",
        updates={
            "title": "Updated Title",
            "updated_by": "admin_1",
        },
    )


@pytest.mark.asyncio
async def test_update_announcement_raises_when_missing():
    from app.api.v1.routes.admin_announcements import update_announcement

    announcement_service = AsyncMock()
    announcement_service.update_announcement.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await update_announcement(
            announcement_id="missing",
            request=AnnouncementUpdate(title="Updated"),
            current_user={"id": "admin_1"},
            announcement_service=announcement_service,
        )


@pytest.mark.asyncio
async def test_delete_announcement_deletes_or_raises_when_missing():
    from app.api.v1.routes.admin_announcements import delete_announcement

    announcement_service = AsyncMock()
    announcement_service.delete_announcement.return_value = True

    result = await delete_announcement(
        announcement_id="ann_123",
        current_user={"id": "admin_1"},
        announcement_service=announcement_service,
    )

    assert result["message"] == "Announcement ann_123 deleted"
    announcement_service.delete_announcement.assert_awaited_once_with("ann_123")

    announcement_service.delete_announcement.return_value = False
    with pytest.raises(ResourceNotFoundError):
        await delete_announcement(
            announcement_id="missing",
            current_user={"id": "admin_1"},
            announcement_service=announcement_service,
        )
