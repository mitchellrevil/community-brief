"""HTTP-adjacent business-unit workflows owned outside route modules."""
from __future__ import annotations

from typing import Any

from ...core.errors.domain import PermissionError as ApplicationPermissionError
from ...core.errors.domain import ResourceNotFoundError, ValidationError
from ...schemas.business_units import (
    BulkUserUpdate,
    BulkUserUpdateResponse,
    BusinessUnitCreate,
    BusinessUnitListResponse,
    BusinessUnitResponse,
    BusinessUnitStats,
    BusinessUnitUpdate,
    UserBusinessUnitAssignment,
    UserBusinessUnitAssignmentResponse,
)
from ..auth.permission_service import PermissionService
from ..users.user_service import UserService
from .business_unit_service import BusinessUnitService


class BusinessUnitWorkflowService:
    def __init__(
        self,
        *,
        business_unit_service: BusinessUnitService,
        permission_service: PermissionService,
        user_service: UserService,
    ) -> None:
        self.business_unit_service = business_unit_service
        self.permission_service = permission_service
        self.user_service = user_service

    async def create_business_unit(
        self,
        *,
        business_unit: BusinessUnitCreate,
        current_user: dict[str, Any],
    ) -> BusinessUnitResponse:
        self._require_business_unit_admin(current_user, "Only admins can create business units")
        category = await self.business_unit_service.create_business_unit(
            name=business_unit.name,
            description=business_unit.description,
        )
        return self._business_unit_response(category)

    async def list_business_units(self, *, limit: int, offset: int) -> BusinessUnitListResponse:
        result = await self.business_unit_service.list_business_units(limit=limit, offset=offset)
        business_units = [self._business_unit_response(category) for category in result["items"]]
        total = result["total"]
        return BusinessUnitListResponse(
            business_units=business_units,
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + len(business_units)) < total,
        )

    async def assign_user_to_business_unit(
        self,
        *,
        assignment: UserBusinessUnitAssignment,
        current_user: dict[str, Any],
    ) -> UserBusinessUnitAssignmentResponse:
        self._require_business_unit_assignment_admin(
            current_user,
            "Only admins can assign users to business units",
        )

        business_unit_ids = assignment.business_unit_ids or []
        result = await self.user_service.set_user_business_units(
            target_user_id=assignment.user_id,
            business_unit_ids=business_unit_ids,
        )
        business_unit_names = result["business_unit_names"]
        message = (
            f"User successfully assigned to {len(business_unit_ids)} business unit(s): {', '.join(business_unit_names)}"
            if business_unit_ids
            else "User business unit assignments cleared"
        )
        return UserBusinessUnitAssignmentResponse(
            user_id=assignment.user_id,
            business_unit_ids=business_unit_ids,
            business_unit_names=business_unit_names,
            success=True,
            message=message,
        )

    async def bulk_update_users(
        self,
        *,
        bulk_update: BulkUserUpdate,
        current_user: dict[str, Any],
    ) -> BulkUserUpdateResponse:
        self._require_business_unit_assignment_admin(current_user, "Only admins can bulk update users")
        if not bulk_update.user_ids:
            raise ValidationError("No user IDs provided", field="user_ids")

        result = await self.user_service.bulk_update_users(bulk_update)
        return BulkUserUpdateResponse(**result)

    async def get_business_unit(
        self,
        *,
        business_unit_id: str,
        current_user: dict[str, Any],
    ) -> BusinessUnitResponse:
        self._require_business_unit_admin(current_user, "Only admins can view business unit details")
        category = await self._load_top_level_business_unit(business_unit_id)
        return self._business_unit_response(category)

    async def update_business_unit(
        self,
        *,
        business_unit_id: str,
        business_unit: BusinessUnitUpdate,
        current_user: dict[str, Any],
    ) -> BusinessUnitResponse:
        self._require_business_unit_admin(current_user, "Only admins can update business units")
        category = await self._load_top_level_business_unit(business_unit_id)
        updated_category = await self.business_unit_service.update_business_unit(
            bu_id=business_unit_id,
            name=business_unit.name if business_unit.name else category["name"],
            description=business_unit.description,
        )
        return self._business_unit_response(updated_category)

    async def get_business_unit_stats(
        self,
        *,
        business_unit_id: str,
        current_user: dict[str, Any],
    ) -> BusinessUnitStats:
        self._require_business_unit_admin(current_user, "Only admins can view business unit statistics")
        category = await self._load_top_level_business_unit(business_unit_id)
        stats = await self.business_unit_service.get_business_unit_stats(business_unit_id)
        return BusinessUnitStats(
            business_unit_id=business_unit_id,
            business_unit_name=category["name"],
            total_users=stats["total_users"],
            total_editors=stats["total_editors"],
            total_categories=stats["total_categories"],
            total_subcategories=stats["total_subcategories"],
            total_prompts=stats["total_prompts"],
        )

    def _require_business_unit_admin(self, current_user: dict[str, Any], message: str) -> None:
        if not self.permission_service.can_manage_business_units(current_user):
            raise ApplicationPermissionError(message)

    def _require_business_unit_assignment_admin(self, current_user: dict[str, Any], message: str) -> None:
        if not self.permission_service.can_assign_user_to_business_unit(current_user):
            raise ApplicationPermissionError(message)

    async def _load_top_level_business_unit(self, business_unit_id: str) -> dict[str, Any]:
        category = await self.business_unit_service.get_business_unit(business_unit_id)
        if not category:
            raise ResourceNotFoundError("Business unit", business_unit_id)
        if category.get("parent_category_id") is not None:
            raise ValidationError(
                f"Category {business_unit_id} is not a business unit",
                field="business_unit_id",
            )
        return category

    @staticmethod
    def _business_unit_response(category: dict[str, Any]) -> BusinessUnitResponse:
        return BusinessUnitResponse(
            id=category["id"],
            name=category["name"],
            description=category.get("description"),
            is_business_unit=category.get("is_business_unit", True),
            parent_category_id=category.get("parent_category_id"),
            created_at=category["created_at"],
            updated_at=category["updated_at"],
        )
