"""Prompt subcategory mutation workflows."""
from __future__ import annotations

import copy
from typing import Any, Dict, List

from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError, ValidationError
from ...models.prompt_visibility import normalize_prompt_visibility
from ...schemas.prompts import SubcategoryCreate, SubcategoryUpdate
from ...services.auth.permission_service import PermissionService
from ...services.interfaces import PromptServiceInterface, TalkingPointsServiceInterface
from .prompt_service import _NOT_PROVIDED
from .prompt_version_service import PromptVersionService


class PromptSubcategoryWorkflowService:
    def __init__(
        self,
        *,
        prompt_service: PromptServiceInterface,
        permission_service: PermissionService,
        talking_points_service: TalkingPointsServiceInterface,
        prompt_version_service: PromptVersionService,
    ) -> None:
        self.prompt_service = prompt_service
        self.permission_service = permission_service
        self.talking_points_service = talking_points_service
        self.prompt_version_service = prompt_version_service

    async def create_subcategory(
        self,
        *,
        subcategory: SubcategoryCreate,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        validated_pre, validated_in = self._validate_talking_points(subcategory)

        category = await self.prompt_service.get_category(subcategory.category_id)
        if not category:
            raise ResourceNotFoundError("Prompt category", subcategory.category_id)

        self.permission_service.set_prompt_service(self.prompt_service)
        if not await self.permission_service.can_edit_category(current_user, category):
            raise ApplicationError(
                "You can only create subcategories under categories in your own business unit",
                ErrorCode.FORBIDDEN,
                status_code=403,
                details={"parent_category_business_unit_id": category.get("business_unit_id")},
            )

        created = await self.prompt_service.create_subcategory(
            subcategory.category_id,
            subcategory.name,
            subcategory.prompts,
            validated_pre,
            validated_in,
            subcategory.analysis_model,
            subcategory.analysis_reasoning,
            subcategory.analysis_verbosity,
            subcategory.analysis_provider,
            subcategory.provider_parameters,
            normalize_prompt_visibility(subcategory.prompt_visibility),
            updated_by_user_id=current_user.get("id"),
            updated_by_display_name=_get_user_display_name(current_user),
            visible_to_user_ids=subcategory.visible_to_user_ids,
            enhanced_reasoning_enabled=subcategory.enhanced_reasoning_enabled or False,
            prompt_constraints=_dump_prompt_constraints(subcategory),
        )

        await self.prompt_version_service.create_version_snapshot(
            subcategory=created,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=_get_user_display_name(current_user),
            source_action="create",
            change_reason="Initial prompt version",
        )

        return self.talking_points_service.ensure_talking_points_structure(created)

    async def update_subcategory(
        self,
        *,
        subcategory_id: str,
        subcategory: SubcategoryUpdate,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.prompt_service.get_subcategory(subcategory_id)
        if not existing:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)

        pre_update_snapshot = copy.deepcopy(existing)
        self.permission_service.set_prompt_service(self.prompt_service)
        if not await self.permission_service.can_edit_prompt(current_user, existing):
            raise ApplicationError(
                "You can only update subcategories in your own business unit",
                ErrorCode.FORBIDDEN,
                status_code=403,
                details={"subcategory_business_unit_id": existing.get("business_unit_id")},
            )

        validated_pre, validated_in = self._validate_talking_points(subcategory)
        updated = await self.prompt_service.update_subcategory(
            subcategory_id,
            subcategory.name,
            subcategory.prompts,
            validated_pre,
            validated_in,
            _field_or_not_provided(subcategory, "analysis_model"),
            _field_or_not_provided(subcategory, "analysis_reasoning"),
            _field_or_not_provided(subcategory, "analysis_verbosity"),
            _field_or_not_provided(subcategory, "analysis_provider"),
            _field_or_not_provided(subcategory, "provider_parameters"),
            (
                normalize_prompt_visibility(subcategory.prompt_visibility)
                if "prompt_visibility" in subcategory.model_fields_set
                else _NOT_PROVIDED
            ),
            updated_by_user_id=current_user.get("id"),
            updated_by_display_name=_get_user_display_name(current_user),
            visible_to_user_ids=_field_or_not_provided(subcategory, "visible_to_user_ids"),
            enhanced_reasoning_enabled=_field_or_not_provided(subcategory, "enhanced_reasoning_enabled"),
            prompt_constraints=_prompt_constraints_update_value(subcategory),
        )
        if not updated:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)

        await self.prompt_version_service.create_version_snapshot(
            subcategory=pre_update_snapshot,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=_get_user_display_name(current_user),
            source_action="update_pre",
            change_reason="Snapshot before prompt update",
        )

        return self.talking_points_service.ensure_talking_points_structure(updated)

    async def move_subcategory(
        self,
        *,
        subcategory_id: str,
        new_category_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.prompt_service.get_subcategory(subcategory_id)
        if not existing:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)
        pre_move_snapshot = copy.deepcopy(existing)

        target_category = await self.prompt_service.get_category(new_category_id)
        if not target_category:
            raise ResourceNotFoundError("Target category", new_category_id)

        self.permission_service.set_prompt_service(self.prompt_service)
        if not await self.permission_service.can_edit_prompt(current_user, existing):
            raise ApplicationError(
                "You can only move subcategories in your own business unit",
                ErrorCode.FORBIDDEN,
                status_code=403,
                details={"subcategory_business_unit_id": existing.get("business_unit_id")},
            )
        if not await self.permission_service.can_edit_category(current_user, target_category):
            raise ApplicationError(
                "You can only move subcategories to categories in your own business unit",
                ErrorCode.FORBIDDEN,
                status_code=403,
                details={"target_category_business_unit_id": target_category.get("business_unit_id")},
            )

        updated = await self.prompt_service.move_subcategory(
            subcategory_id,
            new_category_id,
            updated_by_user_id=current_user.get("id"),
            updated_by_display_name=_get_user_display_name(current_user),
        )
        if not updated:
            raise ApplicationError(
                "Failed to move subcategory",
                ErrorCode.INTERNAL_ERROR,
                status_code=500,
            )

        await self.prompt_version_service.create_version_snapshot(
            subcategory=pre_move_snapshot,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=_get_user_display_name(current_user),
            source_action="move_pre",
            change_reason=f"Snapshot before move to category {new_category_id}",
        )

        return self.talking_points_service.ensure_talking_points_structure(updated)

    async def delete_subcategory(
        self,
        *,
        subcategory_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.prompt_service.get_subcategory(subcategory_id)
        if not existing:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)

        self.permission_service.set_prompt_service(self.prompt_service)
        if not await self.permission_service.can_edit_prompt(current_user, existing):
            raise ApplicationError(
                "You can only delete subcategories in your own business unit",
                ErrorCode.FORBIDDEN,
                status_code=403,
                details={"subcategory_business_unit_id": existing.get("business_unit_id")},
            )

        await self.prompt_version_service.create_version_snapshot(
            subcategory=existing,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=_get_user_display_name(current_user),
            source_action="delete",
            change_reason="Prompt deleted",
        )
        await self.prompt_service.delete_subcategory(subcategory_id)
        return {"status": 200, "message": f"Subcategory '{subcategory_id}' deleted successfully"}

    def _validate_talking_points(
        self,
        subcategory: SubcategoryCreate | SubcategoryUpdate,
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        pre_session = [_model_or_value(item) for item in subcategory.preSessionTalkingPoints]
        in_session = [_model_or_value(item) for item in subcategory.inSessionTalkingPoints]
        try:
            return (
                self.talking_points_service.validate_talking_points_structure(pre_session),
                self.talking_points_service.validate_talking_points_structure(in_session),
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid talking points structure",
                details={"error": str(exc)},
            ) from exc


def _model_or_value(value: Any) -> Any:
    return value.model_dump() if hasattr(value, "model_dump") else value


def _field_or_not_provided(subcategory: SubcategoryUpdate, field_name: str) -> Any:
    if field_name in subcategory.model_fields_set:
        return getattr(subcategory, field_name)
    return _NOT_PROVIDED


def _dump_prompt_constraints(subcategory: SubcategoryCreate) -> Dict[str, Any] | None:
    if not subcategory.prompt_constraints:
        return None
    return {
        key: value.model_dump(exclude_none=True)
        for key, value in subcategory.prompt_constraints.items()
    }


def _prompt_constraints_update_value(subcategory: SubcategoryUpdate) -> Any:
    if "prompt_constraints" not in subcategory.model_fields_set:
        return _NOT_PROVIDED
    if subcategory.prompt_constraints is None:
        return None
    return {
        key: value.model_dump(exclude_none=True)
        for key, value in subcategory.prompt_constraints.items()
    }


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
