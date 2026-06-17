"""UserService encapsulating user management operations with shared helpers."""
from __future__ import annotations

from typing import Dict, Any, List, Optional
from datetime import UTC, datetime

from ...core.errors.domain import (
    ApplicationError,
    ErrorCode,
    PermissionError,
    ResourceNotFoundError,
    ValidationError,
)
from ...core.logging import get_logger
from ...schemas.business_units import BulkUserUpdate
from ...models.permissions import PermissionLevel, has_permission_level
from ...repositories.users import UserRepository
from ..prompts.prompt_service import PromptService

logger = get_logger(__name__)

BULK_USER_UPDATE_ERRORS = (ApplicationError, RuntimeError, ValueError, TypeError)


class UserService:
    def __init__(
        self,
        prompt_service: PromptService,
        user_repository: UserRepository,
    ):
        self.prompt_service = prompt_service
        self.repository = user_repository
        self.logger = logger

    async def list_users(self, *, limit: int, offset: int) -> Dict[str, Any]:
        result = await self.repository.list(limit=limit, offset=offset)
        users = [self._sanitize_user(user) for user in result.get("items", [])]
        return {
            "items": users,
            "total": result.get("total", len(users)),
        }

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        user = await self.repository.get_by_email(email)
        return self._sanitize_user(user) if user else None

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        user = await self.repository.get_by_id(user_id)
        return self._sanitize_user(user) if user else None

    async def search_users(
        self,
        *,
        query: str,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        result = await self.repository.search(query=query, limit=limit, offset=offset)
        result["users"] = [self._sanitize_user(user) for user in result.get("users", [])]
        return result

    async def create_user(
        self,
        *,
        email: str,
        password_hash: str,
        permission: str | None = None,
        extra_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        existing = await self.repository.get_by_email(email)
        if existing:
            raise ApplicationError(
                "Email already registered",
                ErrorCode.RESOURCE_CONFLICT,
                status_code=409,
                details={"email": email},
            )

        timestamp = int(datetime.now(UTC).timestamp() * 1000)
        now_iso = self._now_iso()
        user_data: Dict[str, Any] = {
            "id": f"user_{timestamp}",
            "type": "user",
            "email": email,
            "hashed_password": password_hash,
            "permission": permission or PermissionLevel.USER.value,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        if extra_fields:
            user_data.update(extra_fields)

        created_user = await self.repository.create(user_data)
        return self._sanitize_user(created_user)

    async def update_user(self, user_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            updated_user = await self.repository.update(user_id, update_data)
        except ValueError:
            updated_user = None
        if not updated_user:
            raise ResourceNotFoundError("user", user_id)
        return self._sanitize_user(updated_user)

    async def update_user_password(self, user_id: str, password_hash: str) -> None:
        update_data = {
            "hashed_password": password_hash,
            "updated_at": self._now_iso(),
        }
        await self.repository.update(user_id, update_data)

    async def delete_user(self, user_id: str) -> None:
        await self.repository.delete(user_id)

    async def get_users_by_permission(self, permission_level: str) -> List[Dict[str, Any]]:
        users = await self.repository.get_by_permission(permission_level)
        return [self._sanitize_user(user) for user in users]

    async def self_assign_business_units(
        self,
        *,
        user: Dict[str, Any],
        business_unit_ids: List[str],
    ) -> Dict[str, Any]:
        """Allow a user to self-assign business units during onboarding."""
        if not business_unit_ids:
            raise ValidationError(
                "At least one business unit ID must be provided",
                details={"business_unit_ids": business_unit_ids},
            )

        user_id = user.get("id")
        if not user_id:
            raise ValidationError("User ID not available in current session")

        current_business_units = self._normalize_business_units(user)
        if current_business_units:
            raise PermissionError(
                "User already has business units assigned. Contact administrator to change assignments.",
                details={"current_business_units": current_business_units},
            )

        bu_names = await self._get_business_unit_names(business_unit_ids)

        update_data = {
            "business_unit_ids": business_unit_ids,
            "business_unit_names": bu_names,
            "updated_at": self._now_iso(),
        }

        updated_user = await self.repository.update(user_id, update_data)
        return {
            "status": "success",
            "message": f"Successfully assigned to {len(business_unit_ids)} business unit(s)",
            "user_id": user_id,
            "business_unit_ids": business_unit_ids,
            "business_unit_names": bu_names,
            "user": updated_user,
        }

    async def add_user_to_business_units(
        self,
        *,
        current_user: Dict[str, Any],
        user_email: str,
        business_unit_ids: List[str],
    ) -> Dict[str, Any]:
        """Add the specified user to the provided business unit IDs."""
        if not business_unit_ids:
            raise ValidationError(
                "Either business_unit_id or business_unit_ids must be provided",
                details={"business_unit_ids": business_unit_ids},
            )

        actor_permission = current_user.get("permission")
        if not has_permission_level(actor_permission, PermissionLevel.EDITOR):
            raise PermissionError(
                "Editor permission or higher required to add users to business units",
                details={
                    "required_permission": PermissionLevel.EDITOR.value,
                    "user_permission": actor_permission,
                },
            )

        if not has_permission_level(actor_permission, PermissionLevel.ADMIN):
            actor_business_units = set(self._normalize_business_units(current_user))
            missing = [bu for bu in business_unit_ids if bu not in actor_business_units]
            if missing:
                raise PermissionError(
                    "Editors can only add users to their own business units",
                    details={
                        "requested_bus": business_unit_ids,
                        "editor_bus": list(actor_business_units),
                    },
                )

        target_user = await self.repository.get_by_email(user_email)
        if not target_user:
            raise ResourceNotFoundError("user", user_email)

        updated_business_units = self._normalize_business_units(target_user)
        for bu_id in business_unit_ids:
            if bu_id and bu_id not in updated_business_units:
                updated_business_units.append(bu_id)

        return await self.set_user_business_units(
            target_user_id=target_user.get("id"),
            business_unit_ids=updated_business_units,
        )

    async def set_user_business_units(
        self,
        *,
        target_user_id: str,
        business_unit_ids: Optional[List[str]],
    ) -> Dict[str, Any]:
        user = await self.repository.get_by_id(target_user_id)
        if not user:
            raise ResourceNotFoundError("user", target_user_id)

        business_unit_ids = business_unit_ids or []
        bu_names = await self._get_business_unit_names(business_unit_ids)

        update_data = {
            "business_unit_ids": business_unit_ids,
            "business_unit_names": bu_names,
            "updated_at": self._now_iso(),
        }

        updated_user = await self.repository.update(target_user_id, update_data)
        return {
            "user": self._sanitize_user(updated_user),
            "business_unit_ids": business_unit_ids,
            "business_unit_names": bu_names,
        }

    async def bulk_update_users(self, update: BulkUserUpdate) -> Dict[str, Any]:
        updated_user_ids: List[str] = []
        failed_updates: List[Dict[str, Any]] = []

        for user_id in update.user_ids:
            try:
                user = await self.repository.get_by_id(user_id)
                if not user:
                    failed_updates.append({"user_id": user_id, "error": "User not found"})
                    continue

                update_payload: Dict[str, Any] = {}
                if update.permission:
                    try:
                        PermissionLevel(update.permission)
                    except ValueError as exc:
                        failed_updates.append({"user_id": user_id, "error": str(exc)})
                        continue
                    update_payload["permission"] = update.permission

                new_business_units: Optional[List[str]] = None
                current_bus = self._normalize_business_units(user)
                if update.business_unit_ids is not None:
                    new_business_units = update.business_unit_ids
                elif update.add_business_units:
                    new_business_units = list({*current_bus, *update.add_business_units})
                elif update.remove_business_units:
                    removal = set(update.remove_business_units)
                    new_business_units = [bu for bu in current_bus if bu not in removal]

                if new_business_units is not None:
                    bu_names = await self._get_business_unit_names(new_business_units)
                    update_payload.update(
                        {
                            "business_unit_ids": new_business_units,
                            "business_unit_names": bu_names,
                        }
                    )

                if not update_payload:
                    continue

                update_payload["updated_at"] = self._now_iso()
                await self.repository.update(user_id, update_payload)
                updated_user_ids.append(user_id)
            except BULK_USER_UPDATE_ERRORS as exc:
                self.logger.error(
                    "bulk_user_update_failed",
                    user_id=user_id,
                    error=str(exc),
                    exc_info=True,
                )
                failed_updates.append({"user_id": user_id, "error": str(exc)})

        success_count = len(updated_user_ids)
        failed_count = len(failed_updates)
        message = f"Successfully updated {success_count} user(s)"
        if failed_count:
            message += f", {failed_count} failed"

        return {
            "success_count": success_count,
            "failed_count": failed_count,
            "updated_user_ids": updated_user_ids,
            "failed_updates": failed_updates,
            "message": message,
        }

    def _normalize_business_units(self, user: Dict[str, Any]) -> List[str]:
        """Return a normalized list of business unit IDs for the user."""
        if not user:
            return []
        business_unit_ids = user.get("business_unit_ids") or []
        return [bu for bu in business_unit_ids if bu]

    async def _get_business_unit_names(self, business_unit_ids: List[str]) -> List[str]:
        """Fetch friendly names for each business unit ID, preserving order."""
        if not business_unit_ids:
            return []

        categories = await self.prompt_service.get_categories_by_ids(business_unit_ids)
        names: List[str] = []
        for bu_id in business_unit_ids:
            category = categories.get(bu_id)
            names.append(category.get("name") if category else bu_id)
        return names

    async def remove_business_unit_from_users(self, business_unit_id: str) -> int:
        """Remove references to the given business unit ID from all user records.

        Returns the number of user documents updated.
        """
        updated_count = 0
        # Iterate over all users to find references. Use iterator to avoid loading all users into memory.
        async for user in self.repository.iter_all():
            normalized = self._normalize_business_units(user)
            if business_unit_id in normalized:
                new_bus = [bu for bu in normalized if bu != business_unit_id]
                bu_names = await self._get_business_unit_names(new_bus)
                update_data = {
                    "business_unit_ids": new_bus,
                    "business_unit_names": bu_names,
                    "business_unit_id": new_bus[0] if new_bus else None,
                    "updated_at": self._now_iso(),
                }
                await self.repository.update(user["id"], update_data)
                updated_count += 1
        return updated_count

    async def refresh_business_unit_names(self, business_unit_id: str) -> int:
        """Refresh stored business_unit_names for users that reference the given business unit.

        Returns the number of user documents updated.
        """
        updated_count = 0
        async for user in self.repository.iter_all():
            normalized = self._normalize_business_units(user)
            if business_unit_id in normalized:
                bu_names = await self._get_business_unit_names(normalized)
                update_data = {
                    "business_unit_names": bu_names,
                    "updated_at": self._now_iso(),
                }
                await self.repository.update(user["id"], update_data)
                updated_count += 1
        return updated_count

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat()

    def _sanitize_user(self, user: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not user:
            return None
        sanitized = dict(user)
        sanitized.pop("hashed_password", None)
        return sanitized
