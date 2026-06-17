"""HTTP-adjacent user-management workflows owned outside route modules."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError, ValidationError
from ...core.logging import get_logger
from ...core.security import get_password_hash
from ...models.permissions import PermissionLevel
from ...schemas.users import (
    AddUserToBusinessUnitRequest,
    ChangePasswordRequest,
    RegisterUserRequest,
    SelfAssignToBusinessUnitRequest,
    UserUpdateRequest,
)
from .user_service import UserService

logger = get_logger(__name__)


class UserWorkflowService:
    def __init__(self, user_service: UserService) -> None:
        self.user_service = user_service

    async def list_users(self, *, limit: int, offset: int) -> dict[str, Any]:
        result = await self.user_service.list_users(limit=limit, offset=offset)
        users = result["items"]
        total = result["total"]
        return {
            "status": 200,
            "users": users,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(users)) < total,
        }

    async def get_user_by_email(self, email: str) -> dict[str, Any]:
        user = await self.user_service.get_user_by_email(email)
        if not user:
            raise ResourceNotFoundError("user", email)
        return {"status": 200, "user": user}

    async def search_users(self, *, query: str, limit: int, offset: int) -> dict[str, Any]:
        result = await self.user_service.search_users(query=query, limit=limit, offset=offset)
        return {"status": "success", **result}

    async def get_user_by_id(self, user_id: str) -> dict[str, Any]:
        user = await self.user_service.get_user(user_id)
        if not user:
            raise ResourceNotFoundError("user", user_id)
        return {"status": 200, "user": user}

    async def register_user(
        self,
        *,
        register_request: RegisterUserRequest,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        email = register_request.email.strip().lower()
        target_permission = register_request.permission or PermissionLevel.USER
        created_user = await self.user_service.create_user(
            email=email,
            password_hash=self._hash_user_password(register_request.password),
            permission=target_permission.value,
            extra_fields={
                "source": "password",
                "created_by": current_user.get("id"),
                "is_active": True,
                "last_login": None,
            },
        )

        logger.info(
            "auth_user_created",
            user_id=created_user["id"],
            moderator_id=current_user.get("id"),
        )
        return {
            "status": 200,
            "message": f"User {email} created successfully",
            "user": created_user,
        }

    async def update_user(self, *, user_id: str, update_request: UserUpdateRequest) -> dict[str, Any]:
        updated_user = await self.user_service.update_user(user_id, update_request.model_dump(exclude_none=True))
        return {"status": 200, "user": updated_user}

    async def change_user_password(
        self,
        *,
        user_id: str,
        password_data: ChangePasswordRequest,
        current_user: dict[str, Any],
    ) -> dict[str, str]:
        try:
            await self.user_service.update_user_password(user_id, self._hash_user_password(password_data.new_password))
        except ValueError as exc:
            raise ResourceNotFoundError("user", user_id) from exc

        logger.info(
            "auth_user_password_changed",
            user_id=user_id,
            admin_id=current_user["id"],
            updated_at=datetime.now(UTC).isoformat(),
        )
        return {"status": "success", "message": "Password changed successfully"}

    async def delete_user(self, *, user_id: str, current_user: dict[str, Any]) -> dict[str, str]:
        if user_id == current_user["id"]:
            raise ApplicationError(
                "Cannot delete your own account",
                ErrorCode.OPERATION_NOT_ALLOWED,
                status_code=400,
                details={"user_id": user_id},
            )

        user = await self.user_service.get_user(user_id)
        if not user:
            raise ResourceNotFoundError("user", user_id)

        await self.user_service.delete_user(user_id)
        logger.info(
            "auth_user_deleted",
            user_id=user_id,
            admin_id=current_user["id"],
        )
        return {
            "status": "success",
            "message": f"User {user.get('email', user_id)} deleted successfully",
        }

    async def self_assign_to_business_units(
        self,
        *,
        payload: SelfAssignToBusinessUnitRequest,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.user_service.self_assign_business_units(
            user=current_user,
            business_unit_ids=payload.business_unit_ids,
        )

    async def add_user_to_business_unit(
        self,
        *,
        payload: AddUserToBusinessUnitRequest,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        if not payload.business_unit_ids:
            raise ValidationError(
                "At least one business unit ID must be provided",
                details={"payload": payload.model_dump()},
            )

        result = await self.user_service.add_user_to_business_units(
            current_user=current_user,
            user_email=payload.user_email,
            business_unit_ids=payload.business_unit_ids,
        )
        return {
            "status": "success",
            "message": f"User {payload.user_email} added to business units",
            "user_id": result["user"].get("id") if result.get("user") else None,
            "business_unit_ids": result.get("business_unit_ids", []),
            "business_unit_names": result.get("business_unit_names", []),
        }

    @staticmethod
    def _hash_user_password(password: str) -> str:
        try:
            return get_password_hash(password)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
