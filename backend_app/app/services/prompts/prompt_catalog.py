from __future__ import annotations

import copy
import json
import uuid
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from ...core.config import DatabaseError
from ...core.errors.domain import (
    ApplicationError,
    ErrorCode,
    ResourceNotFoundError,
    ValidationError,
)
from ...models.permissions import PermissionLevel, has_permission_level
from ...models.prompt_visibility import (
    can_user_access_template,
)
from ...repositories.prompt_versions import PromptVersionRepository
from ...schemas.prompt_catalog import (
    PromptTemplateCreate,
    PromptTemplatePatch,
    PromptCatalogView,
    PromptFolderPatch,
)
from ..auth.permission_service import PermissionService
from ..inference_catalog_service import InferenceCatalogService
from ..users.user_service import UserService
from .prompt_store import NOT_PROVIDED, PromptStore
from .talking_points_service import TalkingPointsService
from .form_definition import validate_form_definition


USER_DENORMALIZATION_ERRORS = (
    ApplicationError,
    DatabaseError,
    RuntimeError,
    ValueError,
    TypeError,
)


class PromptCatalog:
    """User-facing prompt catalog behaviour behind one concrete interface."""

    def __init__(
        self,
        *,
        store: PromptStore,
        permission_service: PermissionService,
        talking_points_service: TalkingPointsService,
        version_repository: PromptVersionRepository,
        inference_catalog_service: InferenceCatalogService,
        user_service: Optional[UserService] = None,
    ) -> None:
        self.store = store
        self.permission_service = permission_service
        self.talking_points_service = talking_points_service
        self.version_repository = version_repository
        self.inference_catalog_service = inference_catalog_service
        self.user_service = user_service
        self.permission_service.set_prompt_store(store)

    async def list_folders(
        self,
        *,
        view: PromptCatalogView,
        limit: int,
        offset: int,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._require_view(view, current_user)
        try:
            result = await self.store.list_folders(limit=None, offset=0)
        except DatabaseError as exc:
            raise self._database_unavailable("list prompt folders") from exc
        visible = [
            folder
            for folder in result["items"]
            if await self._can_view_folder(folder, view, current_user)
        ]
        return self._page(visible, limit, offset)

    async def get_folder(
        self,
        folder_id: str,
        *,
        view: PromptCatalogView,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._require_view(view, current_user)
        folder = await self.store.get_folder(folder_id)
        if not folder or not await self._can_view_folder(folder, view, current_user):
            raise ResourceNotFoundError("Prompt folder", folder_id)
        return folder

    async def create_folder(
        self,
        *,
        name: str,
        parent_id: Optional[str],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        if parent_id is None:
            if not self.permission_service.can_manage_business_units(current_user):
                raise self._forbidden("Only admins can create top-level prompt folders")
        else:
            parent = await self.store.get_folder(parent_id)
            if not parent:
                raise ResourceNotFoundError("Parent prompt folder", parent_id)
            await self._require_folder_edit(parent, current_user)
        try:
            return await self.store.create_folder(name, parent_id)
        except DatabaseError as exc:
            raise self._database_unavailable("create prompt folder") from exc

    async def update_folder(
        self,
        folder_id: str,
        *,
        patch: PromptFolderPatch,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.store.get_folder(folder_id)
        if not existing:
            raise ResourceNotFoundError("Prompt folder", folder_id)
        await self._require_folder_edit(existing, current_user)
        changes = patch.model_dump(exclude_unset=True)
        if changes.get("parent_id"):
            parent = await self.store.get_folder(changes["parent_id"])
            if not parent:
                raise ResourceNotFoundError("Parent prompt folder", changes["parent_id"])
            await self._require_folder_edit(parent, current_user)
        changes = {
            key: value for key, value in changes.items() if existing.get(key) != value
        }
        if not changes:
            return existing
        try:
            updated = await self.store.update_folder(folder_id, **changes)
        except DatabaseError as exc:
            raise self._database_unavailable("update prompt folder") from exc
        if not updated:
            raise ResourceNotFoundError("Prompt folder", folder_id)
        if existing.get("parent_id") is None and "name" in changes:
            await self._refresh_business_unit_names(folder_id)
        return updated

    async def delete_folder(
        self, folder_id: str, *, current_user: Dict[str, Any]
    ) -> None:
        existing = await self.store.get_folder(folder_id)
        if not existing:
            raise ResourceNotFoundError("Prompt folder", folder_id)
        await self._require_folder_edit(existing, current_user)
        try:
            await self.store.delete_folder_and_templates(
                folder_id, deleted_by_user_id=current_user.get("id")
            )
        except DatabaseError as exc:
            raise self._database_unavailable("delete prompt folder") from exc
        if existing.get("parent_id") is None:
            await self._remove_business_unit_from_users(folder_id)

    async def list_templates(
        self,
        *,
        folder_id: Optional[str],
        view: PromptCatalogView,
        limit: int,
        offset: int,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._require_view(view, current_user)
        try:
            result = await self.store.list_templates(
                folder_id=folder_id, limit=None, offset=0
            )
        except DatabaseError as exc:
            raise self._database_unavailable("list prompt templates") from exc
        visible = [
            template
            for template in result["items"]
            if await self._can_view_template(template, view, current_user)
        ]
        return self._page(visible, limit, offset)

    async def get_template(
        self,
        template_id: str,
        *,
        view: PromptCatalogView,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._require_view(view, current_user)
        template = await self.store.get_template(template_id)
        if not template or not await self._can_view_template(
            template, view, current_user
        ):
            raise ResourceNotFoundError("Prompt template", template_id)
        return template

    async def create_template(
        self, request: PromptTemplateCreate, *, current_user: Dict[str, Any]
    ) -> Dict[str, Any]:
        folder = await self.store.get_folder(request.folder_id)
        if not folder:
            raise ResourceNotFoundError("Prompt folder", request.folder_id)
        await self._require_folder_edit(folder, current_user)
        pre_session = self._validate_talking_points(
            request.pre_session_talking_points
        )
        in_session = self._validate_talking_points(
            request.in_session_talking_points
        )
        model, provider, parameters = await self._validate_inference(
            model=request.analysis_model,
            provider=request.analysis_provider,
            parameters=request.provider_parameters,
        )
        created = await self.store.create_template(
            request.folder_id,
            request.name,
            request.prompts,
            pre_session,
            in_session,
            model,
            request.analysis_reasoning,
            request.analysis_verbosity,
            provider,
            parameters,
            request.analysis_workflow,
            request.visibility,
            updated_by_user_id=current_user.get("id"),
            updated_by_display_name=self._display_name(current_user),
            visible_to_user_ids=request.visible_to_user_ids,
            speaker_identification_enabled=request.speaker_identification_enabled,
            prompt_metadata=self._metadata_dict(request.prompt_metadata),
            recording_disclaimer_enabled=request.recording_disclaimer_enabled,
            recording_disclaimer=request.recording_disclaimer,
        )
        await self._create_version_snapshot(
            template=created,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=self._display_name(current_user),
            source_action="create",
            change_reason="Initial prompt version",
        )
        return created

    async def update_template(
        self,
        template_id: str,
        *,
        patch: PromptTemplatePatch,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self.store.get_template(template_id)
        if not existing:
            raise ResourceNotFoundError("Prompt template", template_id)
        await self._require_template_edit(existing, current_user)

        changes = patch.model_dump(exclude_unset=True)
        if "folder_id" in changes and changes["folder_id"] != existing.get("folder_id"):
            target = await self.store.get_folder(changes["folder_id"])
            if not target:
                raise ResourceNotFoundError("Prompt folder", changes["folder_id"])
            await self._require_folder_edit(target, current_user)
            changes["business_unit_id"] = target.get("business_unit_id")
        for field in ("pre_session_talking_points", "in_session_talking_points"):
            if field in changes:
                changes[field] = self._validate_talking_points(changes[field])
        if {"analysis_model", "analysis_provider", "provider_parameters"}.intersection(
            changes
        ):
            model, provider, parameters = await self._validate_inference(
                model=changes.get("analysis_model", existing.get("analysis_model")),
                provider=changes.get(
                    "analysis_provider", existing.get("analysis_provider")
                ),
                parameters=changes.get(
                    "provider_parameters", existing.get("provider_parameters")
                ),
                allow_deprecated=changes.get("analysis_model")
                == existing.get("analysis_model"),
            )
            changes.update(
                analysis_model=model,
                analysis_provider=provider,
                provider_parameters=parameters,
            )
        if "prompt_metadata" in changes:
            changes["prompt_metadata"] = self._metadata_dict(patch.prompt_metadata)
        changes = {
            key: value for key, value in changes.items() if existing.get(key) != value
        }
        if not changes:
            return existing
        changes["updated_by_user_id"] = current_user.get("id") or NOT_PROVIDED
        changes["updated_by_display_name"] = (
            self._display_name(current_user) or NOT_PROVIDED
        )
        await self._create_version_snapshot(
            template=copy.deepcopy(existing),
            created_by_user_id=current_user.get("id"),
            created_by_display_name=self._display_name(current_user),
            source_action="update_pre",
            change_reason="Snapshot before prompt template update",
        )
        updated = await self.store.update_template(template_id, **changes)
        if not updated:
            raise ResourceNotFoundError("Prompt template", template_id)
        return updated

    async def delete_template(
        self, template_id: str, *, current_user: Dict[str, Any]
    ) -> None:
        existing = await self.store.get_template(template_id)
        if not existing:
            raise ResourceNotFoundError("Prompt template", template_id)
        await self._require_template_edit(existing, current_user)
        await self._create_version_snapshot(
            template=existing,
            created_by_user_id=current_user.get("id"),
            created_by_display_name=self._display_name(current_user),
            source_action="delete",
            change_reason="Prompt template deleted",
        )
        await self.store.delete_template(template_id)

    async def list_versions(
        self,
        template_id: str,
        *,
        limit: int,
        offset: int,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        await self._require_managed_template(template_id, current_user)
        return await self._list_versions(
            template_id, limit=limit, offset=offset
        )

    async def get_version(
        self,
        template_id: str,
        version_id: str,
        *,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        await self._require_managed_template(template_id, current_user)
        version = await self._get_version(template_id, version_id)
        if not version:
            raise ResourceNotFoundError("Prompt version", version_id)
        return self._version_http_response(version, template_id)

    async def compare_versions(
        self,
        template_id: str,
        *,
        left: str,
        right: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = await self._require_managed_template(
            template_id, current_user
        )
        try:
            return await self._diff_versions(
                template_id=template_id,
                left=left,
                right=right,
                current_template=existing,
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid version comparison",
                details={"error": str(exc), "left": left, "right": right},
            ) from exc

    async def restore_version(
        self,
        template_id: str,
        version_id: str,
        *,
        reason: Optional[str],
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        await self._require_managed_template(template_id, current_user)
        try:
            return await self._restore_version(
                template_id=template_id,
                version_id=version_id,
                current_user=current_user,
                reason=reason,
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid version restore",
                details={"error": str(exc), "version_id": version_id},
            ) from exc

    async def require_runtime_template(
        self, template_id: str, *, current_user: Dict[str, Any]
    ) -> Dict[str, Any]:
        template = await self.store.get_template(template_id)
        if not template:
            raise ResourceNotFoundError("Prompt template", template_id)
        if not await self._can_view_template(
            template, "runtime", current_user
        ):
            raise self._forbidden("You cannot use this prompt template")
        return template

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.now(UTC).timestamp() * 1000)

    @classmethod
    def _version_id(cls, template_id: str) -> str:
        return f"version_{template_id}_{cls._now_ms()}_{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _version_metadata(version: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": version.get("id"),
            "created_at": version.get("created_at"),
            "created_by_user_id": version.get("created_by_user_id"),
            "created_by_display_name": version.get("created_by_display_name"),
            "source_action": version.get("source_action"),
            "change_reason": version.get("change_reason"),
        }

    @staticmethod
    def _version_http_response(
        version: Dict[str, Any], template_id: str
    ) -> Dict[str, Any]:
        response = dict(version)
        response["template_id"] = response.pop("meeting_type_id", template_id)
        return response

    async def _create_version_snapshot(
        self,
        *,
        template: Dict[str, Any],
        created_by_user_id: Optional[str],
        created_by_display_name: Optional[str],
        source_action: str,
        change_reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        template_id = template.get("id") if template else None
        if not template_id:
            raise ValueError("template id is required for a version snapshot")
        return await self.version_repository.create_version(
            {
                "id": self._version_id(str(template_id)),
                "type": "prompt_subcategory_version",
                "template_id": str(template_id),
                "snapshot": copy.deepcopy(template),
                "created_at": self._now_ms(),
                "created_by_user_id": (
                    str(created_by_user_id) if created_by_user_id else None
                ),
                "created_by_display_name": (
                    str(created_by_display_name)
                    if created_by_display_name
                    else None
                ),
                "source_action": source_action,
                "change_reason": change_reason,
            }
        )

    async def _list_versions(
        self, template_id: str, *, limit: int, offset: int
    ) -> Dict[str, Any]:
        versions = await self.version_repository.list_versions_by_meeting_type(
            template_id
        )
        versions.sort(key=lambda item: item.get("created_at", 0), reverse=True)
        page = versions[offset : offset + limit]
        return {
            "items": [self._version_metadata(item) for item in page],
            "total": len(versions),
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(page) < len(versions),
        }

    async def _get_version(
        self, template_id: str, version_id: str
    ) -> Optional[Dict[str, Any]]:
        version = await self.version_repository.get_version(version_id)
        if (
            not version
            or version.get("type") != "prompt_subcategory_version"
            or version.get("template_id") != template_id
        ):
            return None
        return version

    @staticmethod
    def _version_text(snapshot: Dict[str, Any]) -> str:
        sections: List[str] = ["Prompt:", f"Name: {snapshot.get('name', '')}"]
        prompts = snapshot.get("prompts") or {}
        if isinstance(prompts, dict):
            for key in sorted(prompts):
                value = prompts[key]
                sections.extend(
                    [
                        f"[{key}]",
                        value
                        if isinstance(value, str)
                        else json.dumps(value, ensure_ascii=False),
                        "",
                    ]
                )
        sections.extend(
            [
                "Visibility:",
                f"Visibility: {snapshot.get('visibility') or 'all'}",
                "User allowlist: "
                + (
                    json.dumps(
                        snapshot.get("visible_to_user_ids"),
                        indent=2,
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                    if snapshot.get("visible_to_user_ids")
                    else "No user restrictions"
                ),
                "",
                "Inference Settings:",
            ]
        )
        for label, field_name in (
            ("Model", "analysis_model"),
            ("Provider", "analysis_provider"),
            ("Reasoning", "analysis_reasoning"),
            ("Verbosity", "analysis_verbosity"),
            ("Speaker identification", "speaker_identification_enabled"),
            ("Recording disclaimer enabled", "recording_disclaimer_enabled"),
            ("Recording disclaimer", "recording_disclaimer"),
        ):
            value = snapshot.get(field_name)
            sections.append(f"{label}: {value if value is not None else 'Default'}")
        sections.extend(
            [
                "Provider parameters:",
                json.dumps(
                    snapshot.get("provider_parameters") or {},
                    indent=2,
                    ensure_ascii=False,
                    sort_keys=True,
                ),
                "",
            ]
        )
        for label, field_name, empty_label in (
            (
                "Pre-session Form",
                "pre_session_talking_points",
                "No pre-session fields",
            ),
            (
                "In-session Form",
                "in_session_talking_points",
                "No in-session talking points",
            ),
        ):
            value = snapshot.get(field_name)
            sections.extend(
                [
                    f"{label}:",
                    json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True)
                    if value
                    else empty_label,
                    "",
                ]
            )
        return "\n".join(sections).strip()

    @staticmethod
    def _count_diff_lines(left_text: str, right_text: str) -> Tuple[int, int]:
        added = 0
        removed = 0
        matcher = SequenceMatcher(None, left_text.splitlines(), right_text.splitlines())
        for tag, left_start, left_end, right_start, right_end in matcher.get_opcodes():
            if tag == "insert":
                added += right_end - right_start
            elif tag == "delete":
                removed += left_end - left_start
            elif tag == "replace":
                removed += left_end - left_start
                added += right_end - right_start
        return added, removed

    async def _resolve_version_reference(
        self,
        *,
        template_id: str,
        reference: str,
        current_template: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        if reference == "current":
            current = current_template or await self.store.get_template(
                template_id
            )
            if not current:
                raise ValueError(f"Current prompt template '{template_id}' not found")
            return copy.deepcopy(current), {
                "id": "current",
                "created_at": current.get("updated_at"),
                "created_by_user_id": current.get("updated_by_user_id"),
                "created_by_display_name": current.get("updated_by_display_name"),
                "source_action": "current",
                "change_reason": None,
            }
        version = await self._get_version(template_id, reference)
        if not version:
            raise ValueError(
                f"Version '{reference}' not found for prompt template '{template_id}'"
            )
        return (
            copy.deepcopy(version.get("snapshot") or {}),
            self._version_metadata(version),
        )

    async def _diff_versions(
        self,
        *,
        template_id: str,
        left: str,
        right: str,
        current_template: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        left_snapshot, left_metadata = await self._resolve_version_reference(
            template_id=template_id,
            reference=left,
            current_template=current_template,
        )
        right_snapshot, right_metadata = await self._resolve_version_reference(
            template_id=template_id,
            reference=right,
            current_template=current_template,
        )
        left_text = self._version_text(left_snapshot)
        right_text = self._version_text(right_snapshot)
        added, removed = self._count_diff_lines(left_text, right_text)
        return {
            "left": left_metadata,
            "right": right_metadata,
            "left_text": left_text,
            "right_text": right_text,
            "summary": {"added": added, "removed": removed},
        }

    async def _restore_version(
        self,
        *,
        template_id: str,
        version_id: str,
        current_user: Dict[str, Any],
        reason: Optional[str],
    ) -> Dict[str, Any]:
        current = await self.store.get_template(template_id)
        target = await self._get_version(template_id, version_id)
        if not current:
            raise ValueError(f"Prompt template '{template_id}' not found")
        if not target:
            raise ValueError(
                f"Version '{version_id}' not found for prompt template '{template_id}'"
            )
        actor_id = current_user.get("id")
        actor_name = self._display_name(current_user)
        await self._create_version_snapshot(
            template=current,
            created_by_user_id=actor_id,
            created_by_display_name=actor_name,
            source_action="restore_pre",
            change_reason=reason or "Restore requested",
        )
        restored = copy.deepcopy(target.get("snapshot") or {})
        restored["id"] = template_id
        restored["updated_at"] = self._now_ms()
        restored.setdefault("created_at", current.get("created_at", restored["updated_at"]))
        if actor_id:
            restored["updated_by_user_id"] = str(actor_id)
        if actor_name:
            restored["updated_by_display_name"] = actor_name
        updated = await self.store.replace_template(restored)
        await self._create_version_snapshot(
            template=updated,
            created_by_user_id=actor_id,
            created_by_display_name=actor_name,
            source_action="restore_post",
            change_reason=reason or "Restore completed",
        )
        return updated

    async def _require_managed_template(
        self, template_id: str, current_user: Dict[str, Any]
    ) -> Dict[str, Any]:
        self._require_view("management", current_user)
        template = await self.store.get_template(template_id)
        if not template:
            raise ResourceNotFoundError("Prompt template", template_id)
        await self._require_template_edit(template, current_user)
        return template

    async def _can_view_folder(
        self,
        folder: Dict[str, Any],
        view: PromptCatalogView,
        current_user: Dict[str, Any],
    ) -> bool:
        # Business-unit ownership controls mutation, not catalogue discovery.
        return True

    async def _can_view_template(
        self,
        template: Dict[str, Any],
        view: PromptCatalogView,
        current_user: Dict[str, Any],
    ) -> bool:
        if view == "management":
            if await self.permission_service.can_edit_prompt_template(
                current_user, template
            ):
                # Editors must still be able to manage their own hidden drafts.
                return True
        return can_user_access_template(current_user, template)

    def _require_view(
        self, view: PromptCatalogView, current_user: Dict[str, Any]
    ) -> None:
        if view == "management" and not has_permission_level(
            current_user.get("permission"), PermissionLevel.EDITOR.value
        ):
            raise self._forbidden("Management view requires editor access")

    async def _require_folder_edit(
        self, folder: Dict[str, Any], current_user: Dict[str, Any]
    ) -> None:
        if not await self.permission_service.can_edit_folder(current_user, folder):
            raise self._forbidden("You can only edit folders in your business unit")

    async def _require_template_edit(
        self, template: Dict[str, Any], current_user: Dict[str, Any]
    ) -> None:
        if not await self.permission_service.can_edit_prompt_template(
            current_user, template
        ):
            raise self._forbidden(
                "You can only edit prompt templates in your business unit"
            )

    def _validate_talking_points(self, points: list[dict[str, Any]]) -> list[dict[str, Any]]:
        try:
            validate_form_definition(points)
            return self.talking_points_service.validate_talking_points_structure(points)
        except ValueError as exc:
            raise ValidationError(
                "Invalid talking points structure", details={"error": str(exc)}
            ) from exc

    async def _validate_inference(
        self,
        *,
        model: Optional[str],
        provider: Optional[str],
        parameters: Optional[Dict[str, Any]],
        allow_deprecated: bool = False,
    ) -> tuple[Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        try:
            return await self.inference_catalog_service.validate_configuration(
                model_key=model,
                provider=provider,
                parameters=parameters,
                allow_deprecated=allow_deprecated,
            )
        except ValueError as exc:
            raise ValidationError(
                "Invalid inference configuration", details={"error": str(exc)}
            ) from exc

    async def _refresh_business_unit_names(self, folder_id: str) -> None:
        if not self.user_service:
            return
        try:
            await self.user_service.refresh_business_unit_names(folder_id)
        except USER_DENORMALIZATION_ERRORS:
            return

    async def _remove_business_unit_from_users(self, folder_id: str) -> None:
        if not self.user_service:
            return
        try:
            await self.user_service.remove_business_unit_from_users(folder_id)
        except USER_DENORMALIZATION_ERRORS:
            return

    @staticmethod
    def _metadata_dict(metadata: Any) -> Optional[Dict[str, Any]]:
        if metadata is None:
            return None
        value = metadata.model_dump() if hasattr(metadata, "model_dump") else metadata
        return value if any(value.values()) else None

    @staticmethod
    def _display_name(user: Dict[str, Any]) -> str:
        for key in ("full_name", "name", "display_name", "displayname"):
            value = user.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        names = [
            value.strip()
            for value in (user.get("given_name"), user.get("family_name"))
            if isinstance(value, str) and value.strip()
        ]
        return " ".join(names) or str(user.get("email") or "").strip()

    @staticmethod
    def _page(items: list[Dict[str, Any]], limit: int, offset: int) -> Dict[str, Any]:
        page = items[offset : offset + limit]
        total = len(items)
        return {
            "items": page,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(page) < total,
        }

    @staticmethod
    def _forbidden(message: str) -> ApplicationError:
        return ApplicationError(message, ErrorCode.FORBIDDEN, status_code=403)

    @staticmethod
    def _database_unavailable(action: str) -> ApplicationError:
        return ApplicationError(
            "Database service unavailable",
            ErrorCode.SERVICE_UNAVAILABLE,
            status_code=503,
            details={"action": action},
        )
