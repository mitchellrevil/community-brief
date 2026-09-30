"""Unit tests for user-facing announcement route behavior."""
from unittest.mock import AsyncMock

import pytest

from app.core.errors.domain import ResourceNotFoundError


@pytest.mark.asyncio
async def test_get_active_announcements_calls_service_and_shapes_response():
    from app.api.v1.routes.announcements import get_active_announcements

    announcement_service = AsyncMock()
    announcement_service.get_active_announcements_for_user.return_value = [{"id": "ann_1"}]
    current_user = {"id": "user_1", "permission": "USER"}

    result = await get_active_announcements(
        current_user=current_user,
        announcement_service=announcement_service,
    )

    assert result == {"status": "success", "announcements": [{"id": "ann_1"}]}
    announcement_service.get_active_announcements_for_user.assert_awaited_once_with(current_user)


@pytest.mark.asyncio
async def test_get_announcement_by_id_shapes_response():
    from app.api.v1.routes.announcements import get_announcement_by_id

    announcement_service = AsyncMock()
    announcement_service.get_announcement.return_value = {"id": "ann_123"}

    result = await get_announcement_by_id(
        announcement_id="ann_123",
        _current_user={"id": "user_1"},
        announcement_service=announcement_service,
    )

    assert result == {"status": "success", "announcement": {"id": "ann_123"}}
    announcement_service.get_announcement.assert_awaited_once_with("ann_123")


@pytest.mark.asyncio
async def test_get_announcement_by_id_raises_when_missing():
    from app.api.v1.routes.announcements import get_announcement_by_id

    announcement_service = AsyncMock()
    announcement_service.get_announcement.return_value = None

    with pytest.raises(ResourceNotFoundError):
        await get_announcement_by_id(
            announcement_id="missing",
            _current_user={"id": "user_1"},
            announcement_service=announcement_service,
        )


@pytest.mark.asyncio
async def test_mark_announcement_read_uses_current_user_id():
    from app.api.v1.routes.announcements import mark_announcement_read

    announcement_service = AsyncMock()
    announcement_service.mark_announcement_read.return_value = {"status": "success"}
    current_user = {"id": "user_1"}

    result = await mark_announcement_read(
        announcement_id="ann_123",
        current_user=current_user,
        announcement_service=announcement_service,
    )

    assert result == {"status": "success"}
    announcement_service.mark_announcement_read.assert_awaited_once_with(
        announcement_id="ann_123",
        user_id="user_1",
    )


@pytest.mark.asyncio
async def test_dismiss_announcement_uses_current_user_id():
    from app.api.v1.routes.announcements import dismiss_announcement

    announcement_service = AsyncMock()
    announcement_service.dismiss_announcement.return_value = {"status": "success"}
    current_user = {"id": "user_1"}

    result = await dismiss_announcement(
        announcement_id="ann_456",
        current_user=current_user,
        announcement_service=announcement_service,
    )

    assert result == {"status": "success"}
    announcement_service.dismiss_announcement.assert_awaited_once_with(
        announcement_id="ann_456",
        user_id="user_1",
    )
