from datetime import UTC, datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends

from ....core.auth import get_current_user, require_admin, require_editor
from ....core.errors.domain import ApplicationError, ErrorCode
from ....core.rate_limit import admin_mutation_limit, standard_rate_limit
from ....deps import get_user_service
from ....models.permissions import PermissionLevel
from ....schemas.permissions import UserPermissionUpdateRequest
from ....services.users.user_service import UserService


router = APIRouter(prefix="/auth", tags=["permissions"], dependencies=[Depends(standard_rate_limit)])


def _current_user_permissions_response(current_user: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": 200,
        "data": {
            "user_id": current_user.get("id"),
            "email": current_user.get("email"),
            "permission": current_user.get("permission"),
            "business_unit_ids": current_user.get("business_unit_ids", []),
            "business_unit_names": current_user.get("business_unit_names", []),
        },
    }


@router.get("/users/me/permissions")
async def get_my_permissions(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Return the current user's permission level and business unit assignments."""
    return _current_user_permissions_response(current_user)


@router.get("/users/by-permission/{permission_level}")
async def get_users_by_permission(
    permission_level: PermissionLevel,
    _current_user: Dict[str, Any] = Depends(require_editor),
    user_service: UserService = Depends(get_user_service),
):
    """Get all users with a specific permission level."""
    permission_value = permission_level.value
    users = await user_service.get_users_by_permission(permission_value)
    return {
        "status": 200,
        "users": users,
        "count": len(users),
        "permission_level": permission_value,
    }


@router.patch(
    "/users/{user_id}/permission",
    dependencies=[Depends(admin_mutation_limit)],
)
async def update_user_permission(
    user_id: str,
    permission_data: UserPermissionUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Update a user's permission level."""
    if user_id == current_user["id"]:
        raise ApplicationError(
            "Cannot change your own permission level",
            ErrorCode.OPERATION_NOT_ALLOWED,
            status_code=400,
            details={"user_id": user_id},
        )

    new_permission = permission_data.permission.value
    updated_user = await user_service.update_user(
        user_id,
        {
            "permission": new_permission,
            "updated_at": datetime.now(UTC).isoformat(),
        },
    )
    return {
        "status": "success",
        "message": f"User permission updated to {new_permission}",
        "user": updated_user,
    }
