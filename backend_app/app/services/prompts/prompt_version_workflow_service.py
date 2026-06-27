"""Prompt version API workflows."""
from __future__ import annotations

from typing import Any, Dict

from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError, ValidationError
from ...models.prompt_visibility import (
    can_user_access_subcategory,
    derive_subcategory_business_unit_id,
)
from ...services.auth.permission_service import PermissionService
from ...services.interfaces import PromptServiceInterface, TalkingPointsServiceInterface
from .prompt_version_service import PromptVersionService


class PromptVersionWorkflowService:
    def __init__(
        self,
        *,
        prompt_service: PromptServiceInterface,
        prompt_version_service: PromptVersionService,
        permission_service: PermissionService | None = None,
        talking_points_service: TalkingPointsServiceInterface | None = None,
    ) -> None:
        self.prompt_service = prompt_service
        self.prompt_version_service = prompt_version_service
        self.permission_service = permission_service
        self.talking_points_service = talking_points_service

    async def list_versions(
        self,
        *,
        subcategory_id: str,
        limit: int,
        offset: int,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        await self._get_existing_subcategory(subcategory_id, current_user=current_user)
        return await self.prompt_version_service.list_versions(
            subcategory_id,
            limit=limit,
            offset=offset,
        )

    async def get_version(
        self,
        *,
        subcategory_id: str,
        version_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        await self._get_existing_subcategory(subcategory_id, current_user=current_user)
        version = await self.prompt_version_service.get_version(subcategory_id, version_id)
        if not version:
            raise ResourceNotFoundError("Prompt version", version_id)

        return {
            "id": version.get("id"),
            "subcategory_id": version.get("subcategory_id"),
            "created_at": version.get("created_at"),
            "created_by_user_id": version.get("created_by_user_id"),
            "created_by_display_name": version.get("created_by_display_name"),
            "source_action": version.get("source_action"),
            "change_reason": version.get("change_reason"),
            "snapshot": version.get("snapshot") or {},
        }

    async def diff_versions(
        self,
        *,
        subcategory_id: str,
        left: str,
        right: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self._get_existing_subcategory(subcategory_id, current_user=current_user)
        try:
            return await self.prompt_version_service.diff_versions(
                subcategory_id=subcategory_id,
                left=left,
                right=right,
                current_subcategory=existing,
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid version comparison",
                details={"error": str(exc), "left": left, "right": right},
            ) from exc

    async def rollback_to_version(
        self,
        *,
        subcategory_id: str,
        version_id: str,
        reason: str | None,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self._get_existing_subcategory(subcategory_id)
        await self._assert_can_rollback(current_user=current_user, subcategory=existing)

        try:
            rolled_back = await self.prompt_version_service.rollback_to_version(
                subcategory_id=subcategory_id,
                version_id=version_id,
                actor_user_id=current_user.get("id"),
                actor_display_name=_get_user_display_name(current_user),
                reason=reason,
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid rollback request",
                details={"error": str(exc), "version_id": version_id},
            ) from exc

        if self.talking_points_service:
            return self.talking_points_service.ensure_talking_points_structure(rolled_back)
        return rolled_back

    async def _get_existing_subcategory(
        self,
        subcategory_id: str,
        *,
        current_user: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        existing = await self.prompt_service.get_subcategory(subcategory_id)
        if not existing:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)
        if current_user is not None and not await self._can_read_subcategory(
            current_user=current_user,
            subcategory=existing,
        ):
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)
        return existing

    async def _assert_can_rollback(
        self,
        *,
        current_user: Dict[str, Any],
        subcategory: Dict[str, Any],
    ) -> None:
        if not self.permission_service:
            raise ApplicationError(
                "Permission service unavailable",
                ErrorCode.INTERNAL_ERROR,
                status_code=500,
            )

        self.permission_service.set_prompt_service(self.prompt_service)
        if await self.permission_service.can_edit_prompt(current_user, subcategory):
            return

        raise ApplicationError(
            "You can only rollback subcategories in your own business unit",
            ErrorCode.FORBIDDEN,
            status_code=403,
            details={"subcategory_business_unit_id": subcategory.get("business_unit_id")},
        )

    async def _can_read_subcategory(
        self,
        *,
        current_user: Dict[str, Any],
        subcategory: Dict[str, Any],
    ) -> bool:
        business_unit_id = await derive_subcategory_business_unit_id(self.prompt_service, subcategory)
        return can_user_access_subcategory(
            current_user,
            subcategory,
            permission_service=self.permission_service,
            business_unit_id=business_unit_id,
        )


def _get_user_display_name(user: Dict[str, Any]) -> str:
    if not user:
        return ""
    for key in ("full_name", "name", "display_name", "displayname"):
        value = user.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    given = user.get("given_name")
    family = user.get("family_name")
    parts = [
        value.strip()
        for value in (given, family)
        if isinstance(value, str) and value.strip()
    ]
    if parts:
        return " ".join(parts)

    email = user.get("email")
    return email.strip() if isinstance(email, str) else ""
