"""Prompt category workflows and permission checks."""
from __future__ import annotations

from typing import Any, Dict, Optional

from ...core.config import DatabaseError
from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError
from ...core.logging import get_logger
from ...services.interfaces import PromptServiceInterface
from ...services.auth.permission_service import PermissionService
from ...services.users.user_service import UserService


logger = get_logger(__name__)

USER_DENORMALIZATION_ERRORS = (ApplicationError, DatabaseError, RuntimeError, ValueError, TypeError)


class PromptCategoryService:
    def __init__(
        self,
        *,
        prompt_service: PromptServiceInterface,
        permission_service: PermissionService | None = None,
        user_service: UserService | None = None,
    ) -> None:
        self.prompt_service = prompt_service
        self.permission_service = permission_service
        self.user_service = user_service

    async def create_category(
        self,
        *,
        name: str,
        parent_category_id: Optional[str],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            await self._assert_can_create_category(
                current_user=current_user,
                parent_category_id=parent_category_id,
            )
            return await self.prompt_service.create_category(name, parent_category_id)
        except DatabaseError as exc:
            raise self._database_unavailable("create prompt category") from exc

    async def list_categories(self, *, limit: int, offset: int) -> Dict[str, Any]:
        try:
            result = await self.prompt_service.list_categories(limit=limit, offset=offset)
        except DatabaseError as exc:
            raise self._database_unavailable("list prompt categories") from exc

        items = result["items"]
        total = result["total"]
        return {
            "categories": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(items)) < total,
        }

    async def get_category(self, category_id: str) -> Dict[str, Any]:
        try:
            category = await self.prompt_service.get_category(category_id)
        except DatabaseError as exc:
            raise self._database_unavailable("retrieve prompt category") from exc
        if not category:
            raise ResourceNotFoundError("Prompt category", category_id)
        return category

    async def update_category(
        self,
        *,
        category_id: str,
        name: str,
        parent_category_id: Optional[str],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.get_category(category_id)
        await self._assert_can_edit_category(
            current_user=current_user,
            category=existing,
            message="You can only update categories in your own business unit",
        )

        try:
            updated = await self.prompt_service.update_category(
                category_id,
                name,
                parent_category_id,
            )
        except DatabaseError as exc:
            raise self._database_unavailable("update prompt category") from exc
        if not updated:
            raise ResourceNotFoundError("Prompt category", category_id)

        if existing.get("parent_category_id") is None:
            await self._refresh_user_business_unit_names(category_id)
        return updated

    async def delete_category(
        self,
        *,
        category_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.get_category(category_id)
        await self._assert_can_edit_category(
            current_user=current_user,
            category=existing,
            message="You can only delete categories in your own business unit",
        )

        try:
            await self.prompt_service.delete_category_and_subcategories(category_id)
        except DatabaseError as exc:
            raise self._database_unavailable("delete prompt category") from exc

        if existing.get("parent_category_id") is None:
            await self._remove_business_unit_from_users(category_id)

        return {
            "status": 200,
            "message": f"Category '{category_id}' and its subcategories deleted successfully",
        }

    async def _assert_can_create_category(
        self,
        *,
        current_user: Dict[str, Any],
        parent_category_id: Optional[str],
    ) -> None:
        if parent_category_id is None:
            if not self._permission_service().can_manage_business_units(current_user):
                raise ApplicationError(
                    "Only admins can create top-level categories (business units)",
                    ErrorCode.FORBIDDEN,
                    status_code=403,
                )
            return

        parent_category = await self.prompt_service.get_category(parent_category_id)
        if not parent_category:
            raise ApplicationError(
                f"Parent category {parent_category_id} not found",
                ErrorCode.RESOURCE_NOT_FOUND,
                status_code=404,
            )

        await self._assert_can_edit_category(
            current_user=current_user,
            category=parent_category,
            message="You can only create categories under your own business unit",
            details_key="parent_business_unit_id",
        )

    async def _assert_can_edit_category(
        self,
        *,
        current_user: Dict[str, Any],
        category: Dict[str, Any],
        message: str,
        details_key: str = "category_business_unit_id",
    ) -> None:
        permission_service = self._permission_service()
        permission_service.set_prompt_service(self.prompt_service)
        if await permission_service.can_edit_category(current_user, category):
            return

        raise ApplicationError(
            message,
            ErrorCode.FORBIDDEN,
            status_code=403,
            details={details_key: category.get("business_unit_id")},
        )

    async def _refresh_user_business_unit_names(self, category_id: str) -> None:
        if not self.user_service:
            return
        try:
            await self.user_service.refresh_business_unit_names(category_id)
        except USER_DENORMALIZATION_ERRORS as exc:  # Best-effort denormalized user metadata refresh.
            logger.error(
                "prompt_category.user_business_unit_names_refresh_failed",
                category_id=category_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )

    async def _remove_business_unit_from_users(self, category_id: str) -> None:
        if not self.user_service:
            return
        try:
            await self.user_service.remove_business_unit_from_users(category_id)
        except USER_DENORMALIZATION_ERRORS as exc:  # Best-effort denormalized user metadata cleanup.
            logger.error(
                "prompt_category.user_business_unit_cleanup_failed",
                category_id=category_id,
                error=str(exc),
                error_type=type(exc).__name__,
                exc_info=True,
            )

    def _database_unavailable(self, action: str) -> ApplicationError:
        return ApplicationError(
            "Database service unavailable",
            ErrorCode.SERVICE_UNAVAILABLE,
            status_code=503,
            details={"action": action},
        )

    def _permission_service(self) -> PermissionService:
        if not self.permission_service:
            raise ApplicationError(
                "Permission service unavailable",
                ErrorCode.INTERNAL_ERROR,
                status_code=500,
            )
        return self.permission_service
