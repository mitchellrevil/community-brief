from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from ....core.auth import require_moderator
from ....core.errors.domain import ResourceNotFoundError
from ....core.rate_limit import admin_mutation_limit
from ....deps import get_announcement_service
from ....schemas.announcements import AnnouncementCreate, AnnouncementUpdate
from ....services.interfaces import AnnouncementServiceInterface


router = APIRouter(
    prefix="/admin/announcements",
    tags=["announcement-admin"],
    dependencies=[Depends(admin_mutation_limit)],
)


def _announcement_response(announcement_id: str, announcement: dict[str, Any] | None) -> dict[str, Any]:
    if not announcement:
        raise ResourceNotFoundError("Announcement", announcement_id)
    return {
        "status": "success",
        "announcement": announcement,
    }


def _admin_list_response(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "success",
        "items": result["items"],
        "total": result["total"],
        "limit": result["limit"],
        "offset": result["offset"],
    }


@router.get("")
async def list_announcements(
    limit: int = Query(50, ge=1, le=200, description="Maximum number of announcements to return"),
    offset: int = Query(0, ge=0, description="Number of announcements to skip"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    _current_user: dict[str, Any] = Depends(require_moderator),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if is_active is not None:
        filters["is_active"] = is_active

    result = await announcement_service.list_announcements(
        limit=limit,
        offset=offset,
        filters=filters,
    )
    return _admin_list_response(result)


@router.get("/{announcement_id}")
async def get_announcement(
    announcement_id: str,
    _current_user: dict[str, Any] = Depends(require_moderator),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    announcement = await announcement_service.get_announcement(announcement_id)
    return _announcement_response(announcement_id, announcement)


@router.post("")
async def create_announcement(
    request: AnnouncementCreate,
    current_user: dict[str, Any] = Depends(require_moderator),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    announcement_data = request.model_dump()
    announcement_data["created_by"] = current_user.get("id")

    announcement = await announcement_service.create_announcement(announcement_data)
    return {
        "status": "success",
        "announcement": announcement,
    }


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    request: AnnouncementUpdate,
    current_user: dict[str, Any] = Depends(require_moderator),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    updates = {key: value for key, value in request.model_dump().items() if value is not None}
    updates["updated_by"] = current_user.get("id")

    announcement = await announcement_service.update_announcement(
        announcement_id=announcement_id,
        updates=updates,
    )
    return _announcement_response(announcement_id, announcement)


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    current_user: dict[str, Any] = Depends(require_moderator),
    announcement_service: AnnouncementServiceInterface = Depends(get_announcement_service),
) -> dict[str, Any]:
    deleted = await announcement_service.delete_announcement(announcement_id)
    if not deleted:
        raise ResourceNotFoundError("Announcement", announcement_id)
    return {
        "status": "success",
        "message": f"Announcement {announcement_id} deleted",
    }
