from __future__ import annotations

import asyncio
import time
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional, Set

from azure.cosmos import exceptions as cosmos_exceptions

from ...core.logging import get_logger
from ...models.prompt_visibility import (
    DEFAULT_PROMPT_VISIBILITY,
    normalize_prompt_visibility,
    normalize_visible_to_user_ids,
)
from ...repositories.prompts import PromptRepository


logger = get_logger(__name__)
NOT_PROVIDED = object()


class PromptStore:
    """Cached persistence module for prompt folders and templates."""

    _CACHE_TTL_SECONDS = 600.0
    _folders: Optional[List[Dict[str, Any]]] = None
    _templates: Optional[List[Dict[str, Any]]] = None
    _folders_loaded_at = 0.0
    _templates_loaded_at = 0.0
    _folder_lock = asyncio.Lock()
    _template_lock = asyncio.Lock()

    def __init__(self, repository: PromptRepository):
        self.repository = repository
        self.logger = logger

    @staticmethod
    def _sort_key(item: Dict[str, Any]) -> tuple[str, str]:
        return (str(item.get("name") or "").casefold(), str(item.get("id") or ""))

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.now(UTC).timestamp() * 1000)

    @classmethod
    def _invalidate_folders(cls) -> None:
        cls._folders = None
        cls._folders_loaded_at = 0.0

    @classmethod
    def _invalidate_templates(cls) -> None:
        cls._templates = None
        cls._templates_loaded_at = 0.0

    async def _folder_snapshot(self) -> List[Dict[str, Any]]:
        cls = type(self)
        if (
            cls._folders is not None
            and time.monotonic() - cls._folders_loaded_at < cls._CACHE_TTL_SECONDS
        ):
            return cls._folders

        async with cls._folder_lock:
            if (
                cls._folders is None
                or time.monotonic() - cls._folders_loaded_at >= cls._CACHE_TTL_SECONDS
            ):
                cls._folders = await self.repository.list_folders()
                cls._folders.sort(key=cls._sort_key)
                cls._folders_loaded_at = time.monotonic()
        return cls._folders

    async def _template_snapshot(self) -> List[Dict[str, Any]]:
        cls = type(self)
        if (
            cls._templates is not None
            and time.monotonic() - cls._templates_loaded_at < cls._CACHE_TTL_SECONDS
        ):
            return cls._templates

        async with cls._template_lock:
            if (
                cls._templates is None
                or time.monotonic() - cls._templates_loaded_at
                >= cls._CACHE_TTL_SECONDS
            ):
                cls._templates = await self.repository.list_meeting_types()
                cls._templates.sort(key=cls._sort_key)
                cls._templates_loaded_at = time.monotonic()
        return cls._templates

    async def get_folders_by_ids(
        self, folder_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        requested: Set[str] = {folder_id for folder_id in folder_ids if folder_id}
        if not requested:
            return {}
        return {
            folder["id"]: dict(folder)
            for folder in await self._folder_snapshot()
            if folder.get("id") in requested
        }

    async def get_folder_references_by_ids(
        self, folder_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """Resolve active and deleted folders for historical analytics."""
        references: Dict[str, Dict[str, Any]] = {}
        requested_ids = dict.fromkeys(
            folder_id for folder_id in folder_ids if folder_id
        )
        for folder_id in requested_ids:
            folder = await self.repository.get_folder_reference(folder_id)
            if folder:
                references[folder_id] = folder
        return references

    async def get_template_reference(
        self, template_id: str
    ) -> Optional[Dict[str, Any]]:
        template = await self.repository.get_meeting_type_reference(template_id)
        return self._normalize_template(template) if template else None

    async def get_business_unit_id_from_folder(self, folder_id: str) -> Optional[str]:
        folders = {item.get("id"): item for item in await self._folder_snapshot()}
        visited: Set[str] = set()
        current_id: Optional[str] = folder_id
        while current_id and current_id not in visited:
            visited.add(current_id)
            folder = folders.get(current_id)
            if not folder:
                return None
            business_unit_id = folder.get("business_unit_id")
            if business_unit_id:
                return str(business_unit_id)
            parent_id = folder.get("parent_id")
            if not parent_id:
                return str(folder.get("id"))
            current_id = str(parent_id)
        return None

    async def create_folder(
        self, name: str, parent_id: Optional[str] = None
    ) -> Dict[str, Any]:
        timestamp = self._now_ms()
        folder_id = f"category_{timestamp}"
        if parent_id is None:
            business_unit_id = folder_id
            is_business_unit = True
        else:
            business_unit_id = await self.get_business_unit_id_from_folder(parent_id)
            if not business_unit_id:
                raise ValueError(f"Cannot determine business unit for parent folder {parent_id}")
            is_business_unit = False

        created = await self.repository.create_folder(
            {
                "id": folder_id,
                "name": name,
                "created_at": timestamp,
                "updated_at": timestamp,
                "parent_id": parent_id,
                "is_business_unit": is_business_unit,
                "business_unit_id": business_unit_id,
            }
        )
        self._invalidate_folders()
        return created

    async def list_folders(
        self, limit: Optional[int] = None, offset: int = 0
    ) -> Dict[str, Any]:
        snapshot = await self._folder_snapshot()
        total = len(snapshot)
        end = offset + limit if limit is not None else total
        items = snapshot[offset:end] if offset < total else []
        return {
            "items": [dict(item) for item in items],
            "total": total,
            "limit": limit if limit is not None else total,
            "offset": offset,
        }

    async def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        return next(
            (
                dict(folder)
                for folder in await self._folder_snapshot()
                if folder.get("id") == folder_id
            ),
            None,
        )

    async def update_folder(
        self,
        folder_id: str,
        *,
        name: Any = NOT_PROVIDED,
        parent_id: Any = NOT_PROVIDED,
    ) -> Optional[Dict[str, Any]]:
        existing = await self.get_folder(folder_id)
        if not existing:
            return None
        if name is not NOT_PROVIDED:
            existing["name"] = name
        if parent_id is not NOT_PROVIDED:
            new_business_unit_id = (
                folder_id
                if parent_id is None
                else await self.get_business_unit_id_from_folder(parent_id)
            )
            if not new_business_unit_id:
                raise ValueError(f"Cannot determine business unit for parent folder {parent_id}")
            current_business_unit_id = existing.get("business_unit_id")
            if (
                current_business_unit_id
                and new_business_unit_id != current_business_unit_id
            ):
                raise ValueError("Cannot move a folder across business units")
            existing["parent_id"] = parent_id
            existing["business_unit_id"] = new_business_unit_id
            existing["is_business_unit"] = parent_id is None
        elif existing.get("parent_id") and not existing.get("business_unit_id"):
            # Repair legacy folders which predate owner denormalisation.  Their
            # parent is authoritative, so an ordinary rename/save should not
            # leave them invisible to systems that use business-unit scope.
            inherited_business_unit_id = await self.get_business_unit_id_from_folder(
                existing["parent_id"]
            )
            if inherited_business_unit_id:
                existing["business_unit_id"] = inherited_business_unit_id
                existing["is_business_unit"] = False
        existing["updated_at"] = self._now_ms()
        saved = await self.repository.save_folder(existing)
        self._invalidate_folders()
        return saved

    async def delete_folder_and_templates(
        self, folder_id: str, *, deleted_by_user_id: Optional[str]
    ) -> None:
        try:
            await self.repository.archive_folder_tree(
                folder_id,
                deleted_at=self._now_ms(),
                deleted_by_user_id=deleted_by_user_id,
            )
        except cosmos_exceptions.CosmosHttpResponseError as exc:
            logger.error("prompt_folder_delete_failed", folder_id=folder_id, error=str(exc))
            raise
        self._invalidate_folders()
        self._invalidate_templates()

    async def create_template(
        self,
        folder_id: str,
        name: str,
        prompts: Dict[str, str],
        pre_session_talking_points: List[Dict[str, Any]],
        in_session_talking_points: List[Dict[str, Any]],
        analysis_model: Optional[str] = None,
        analysis_reasoning: Optional[str] = None,
        analysis_verbosity: Optional[str] = None,
        analysis_provider: Optional[str] = None,
        provider_parameters: Optional[Dict[str, Any]] = None,
        analysis_workflow: str = "standard",
        visibility: str = DEFAULT_PROMPT_VISIBILITY,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
        visible_to_user_ids: Optional[List[str]] = None,
        speaker_identification_enabled: bool = False,
        prompt_metadata: Optional[Dict[str, Any]] = None,
        recording_disclaimer_enabled: bool = False,
        recording_disclaimer: Optional[str] = None,
    ) -> Dict[str, Any]:
        timestamp = self._now_ms()
        business_unit_id = await self.get_business_unit_id_from_folder(folder_id)
        if not business_unit_id:
            raise ValueError(f"Cannot determine business unit for folder {folder_id}")
        template: Dict[str, Any] = {
            "id": f"subcategory_{timestamp}_{uuid.uuid4().hex}",
            "folder_id": folder_id,
            "name": name,
            "prompts": prompts or {},
            "pre_session_talking_points": pre_session_talking_points or [],
            "in_session_talking_points": in_session_talking_points or [],
            "created_at": timestamp,
            "updated_at": timestamp,
            "business_unit_id": business_unit_id,
            "visibility": normalize_prompt_visibility(visibility),
            "analysis_workflow": analysis_workflow,
        }
        optional_values = {
            "analysis_model": analysis_model,
            "analysis_reasoning": analysis_reasoning,
            "analysis_verbosity": analysis_verbosity,
            "analysis_provider": analysis_provider,
            "provider_parameters": provider_parameters,
            "prompt_metadata": prompt_metadata,
            "recording_disclaimer": recording_disclaimer,
        }
        template.update(
            {key: value for key, value in optional_values.items() if value is not None}
        )
        allowlist = normalize_visible_to_user_ids(visible_to_user_ids)
        if allowlist:
            template["visible_to_user_ids"] = allowlist
        if updated_by_user_id:
            template["updated_by_user_id"] = str(updated_by_user_id)
        if updated_by_display_name:
            template["updated_by_display_name"] = str(updated_by_display_name)
        if speaker_identification_enabled:
            template["speaker_identification_enabled"] = True
        if recording_disclaimer_enabled:
            template["recording_disclaimer_enabled"] = True
        created = await self.repository.create_meeting_type(template)
        self._invalidate_templates()
        return created

    async def list_templates(
        self,
        folder_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> Dict[str, Any]:
        snapshot = await self._template_snapshot()
        filtered = [
            item for item in snapshot if not folder_id or item.get("folder_id") == folder_id
        ]
        total = len(filtered)
        end = offset + limit if limit is not None else total
        items = filtered[offset:end] if offset < total else []
        return {
            "items": [self._normalize_template(item) for item in items],
            "total": total,
            "limit": limit if limit is not None else total,
            "offset": offset,
        }

    async def get_template(
        self, template_id: str
    ) -> Optional[Dict[str, Any]]:
        item = next(
            (
                template
                for template in await self._template_snapshot()
                if template.get("id") == template_id
            ),
            None,
        )
        return self._normalize_template(item) if item else None

    async def get_template_inference_settings(
        self, template_id: str
    ) -> Optional[Dict[str, Any]]:
        item = await self.get_template(template_id)
        if not item:
            return None
        return {
            "analysis_model": item.get("analysis_model"),
            "analysis_reasoning": item.get("analysis_reasoning"),
            "analysis_verbosity": item.get("analysis_verbosity"),
            "analysis_provider": item.get("analysis_provider"),
            "provider_parameters": item.get("provider_parameters"),
            "analysis_workflow": item.get("analysis_workflow", "standard"),
            "speaker_identification_enabled": item.get(
                "speaker_identification_enabled", False
            ),
        }

    async def update_template(
        self, template_id: str, **changes: Any
    ) -> Optional[Dict[str, Any]]:
        existing = await self.get_template(template_id)
        if not existing:
            return None
        for field, value in changes.items():
            if value is NOT_PROVIDED:
                continue
            if field == "visibility":
                existing[field] = normalize_prompt_visibility(value)
            elif field == "visible_to_user_ids":
                allowlist = normalize_visible_to_user_ids(value)
                if allowlist:
                    existing[field] = allowlist
                else:
                    existing.pop(field, None)
            elif value is None:
                existing.pop(field, None)
            else:
                existing[field] = value
        existing["updated_at"] = self._now_ms()
        saved = await self.repository.save_meeting_type(existing)
        self._invalidate_templates()
        return self._normalize_template(saved)

    async def replace_template(
        self, template: Dict[str, Any]
    ) -> Dict[str, Any]:
        saved = await self.repository.save_meeting_type(template)
        self._invalidate_templates()
        return self._normalize_template(saved)

    async def delete_template(self, template_id: str) -> None:
        await self.repository.delete_meeting_type(template_id)
        self._invalidate_templates()

    @staticmethod
    def _normalize_template(item: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(item)
        normalized["visibility"] = normalize_prompt_visibility(
            normalized.get("visibility")
        )
        normalized["visible_to_user_ids"] = normalize_visible_to_user_ids(
            normalized.get("visible_to_user_ids")
        )
        return normalized
