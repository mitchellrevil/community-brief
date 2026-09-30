from typing import Any

from fastapi import APIRouter, Depends

from ....core.auth import get_current_user
from ....core.errors.domain import ResourceNotFoundError
from ....core.rate_limit import standard_rate_limit
from ....deps import get_announcement_service
from ....services.interfaces import AnnouncementServiceInterface


router = APIRouter(prefix="/announcements", tags=["announcements"], dependencies=[Depends(standard_rate_limit)])


def _active_announcements_response(announcements: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "status": "success",
        "announcements": announcements,
    }


def _announcement_response(announcement_id: str, announcement: dict[str, Any] | None) -> dict[str, Any]:
    if not announcement:
        raise ResourceNotFoundError("Announcement", announcement_id)
    return {
        "status": "success",
        "announcement": announcement,
    }


@router.get("")
async def get_active_announcements(
    current_user: dict[str, Any] = Depends(get_current_user),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    announcements = await announcement_service.get_active_announcements_for_user(current_user)
    return _active_announcements_response(announcements)


@router.get("/{announcement_id}")
async def get_announcement_by_id(
    announcement_id: str,
    _current_user: dict[str, Any] = Depends(get_current_user),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    announcement = await announcement_service.get_announcement(announcement_id)
    return _announcement_response(announcement_id, announcement)


@router.post("/{announcement_id}/read")
async def mark_announcement_read(
    announcement_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    return await announcement_service.mark_announcement_read(
        announcement_id=announcement_id,
        user_id=current_user.get("id"),
    )


@router.post("/{announcement_id}/dismiss")
async def dismiss_announcement(
    announcement_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    return await announcement_service.dismiss_announcement(
        announcement_id=announcement_id,
        user_id=current_user.get("id"),
    )
