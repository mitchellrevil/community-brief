from typing import Any

from ...core.logging import get_logger
from ...models.permissions import PermissionLevel, has_permission_level
from ...services.auth.permission_service import PermissionService

logger = get_logger(__name__)

_PERMISSION_LEVELS = {"view": 1, "edit": 2, "admin": 3}


def _user_has_admin_permission(current_user: dict[str, Any]) -> bool:
    permission = current_user.get("permission") if "permission" in current_user else current_user.get("permissions")
    if isinstance(permission, str):
        return has_permission_level(permission, PermissionLevel.ADMIN.value)
    if isinstance(permission, list):
        return any(has_permission_level(str(value), PermissionLevel.ADMIN.value) for value in permission)
    return False


def check_job_access(job: dict[str, Any], current_user: dict[str, Any], required_permission: str = "view") -> bool:
    if not isinstance(job, dict) or not isinstance(current_user, dict):
        return False

    if job.get("deleted", False):
        return False

    if _user_has_admin_permission(current_user):
        return True

    if job.get("user_id") == current_user.get("id"):
        return True

    for share in job.get("shared_with") or []:
        if share.get("user_id") == current_user.get("id"):
            return _PERMISSION_LEVELS.get(share.get("permission_level"), 0) >= _PERMISSION_LEVELS.get(
                required_permission,
                0,
            )

    return False


class JobPermissions:
    def __init__(self, permission_service: PermissionService | None = None):
        self.permission_service = permission_service

    async def check_job_access(
        self,
        job: Any,
        current_user: dict[str, Any],
        required_permission: str = "view",
    ) -> bool:
        if isinstance(job, dict):
            return check_job_access(job, current_user, required_permission)

        logger.info(
            "job_permission_denied_missing_job_record",
            user_id=current_user.get("id") if isinstance(current_user, dict) else None,
            required_permission=required_permission,
        )
        return False

    async def check_user_admin_privileges(self, current_user: dict[str, Any]) -> bool:
        """Return True if the user has an admin permission entry."""
        if not isinstance(current_user, dict):
            return False

        if self.permission_service:
            return self.permission_service.has_permission_level_method(current_user.get("permission", ""), PermissionLevel.ADMIN)

        return _user_has_admin_permission(current_user)
