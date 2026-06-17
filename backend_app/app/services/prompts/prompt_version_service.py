import copy
import json
import uuid
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from ...core.logging import get_logger
from ...repositories.prompt_versions import PromptVersionRepository
from .prompt_service import PromptService

logger = get_logger(__name__)


class PromptVersionService:
    def __init__(
        self,
        prompt_service: PromptService,
        repository: PromptVersionRepository,
    ):
        self.prompt_service = prompt_service
        self.repository = repository

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.now(UTC).timestamp() * 1000)

    @staticmethod
    def _version_id(subcategory_id: str) -> str:
        return f"version_{subcategory_id}_{PromptVersionService._now_ms()}_{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _to_text(snapshot: Dict[str, Any]) -> str:
        sections: List[str] = []
        sections.append(f"Name: {snapshot.get('name', '')}")

        prompts = snapshot.get("prompts") or {}
        if isinstance(prompts, dict) and prompts:
            sections.append("")
            sections.append("Prompts:")
            for key in sorted(prompts.keys()):
                sections.append(f"[{key}]")
                value = prompts.get(key)
                sections.append(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
                sections.append("")

        for label, field_name in (
            ("Pre Session Talking Points", "preSessionTalkingPoints"),
            ("In Session Talking Points", "inSessionTalkingPoints"),
            ("Inference", "provider_parameters"),
        ):
            field_value = snapshot.get(field_name)
            if field_value:
                sections.append(f"{label}:")
                sections.append(json.dumps(field_value, indent=2, ensure_ascii=False, sort_keys=True))
                sections.append("")

        for field_name in ("analysis_model", "analysis_provider", "analysis_reasoning", "analysis_verbosity"):
            if snapshot.get(field_name):
                sections.append(f"{field_name}: {snapshot.get(field_name)}")

        return "\n".join(sections).strip()

    @staticmethod
    def _count_diff_lines(left_text: str, right_text: str) -> Tuple[int, int]:
        left_lines = left_text.splitlines()
        right_lines = right_text.splitlines()
        matcher = SequenceMatcher(None, left_lines, right_lines)
        added = 0
        removed = 0

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "insert":
                added += j2 - j1
            elif tag == "delete":
                removed += i2 - i1
            elif tag == "replace":
                removed += i2 - i1
                added += j2 - j1

        return added, removed

    def _metadata(self, version_doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": version_doc.get("id"),
            "created_at": version_doc.get("created_at"),
            "created_by_user_id": version_doc.get("created_by_user_id"),
            "created_by_display_name": version_doc.get("created_by_display_name"),
            "source_action": version_doc.get("source_action"),
            "change_reason": version_doc.get("change_reason"),
        }

    async def create_version_snapshot(
        self,
        *,
        subcategory: Dict[str, Any],
        created_by_user_id: Optional[str],
        created_by_display_name: Optional[str],
        source_action: str,
        change_reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not subcategory:
            raise ValueError("subcategory is required to create a version snapshot")

        subcategory_id = subcategory.get("id")
        if not subcategory_id:
            raise ValueError("subcategory id is required to create a version snapshot")

        version_doc = {
            "id": self._version_id(subcategory_id),
            "type": "prompt_subcategory_version",
            "subcategory_id": subcategory_id,
            "snapshot": copy.deepcopy(subcategory),
            "created_at": self._now_ms(),
            "created_by_user_id": str(created_by_user_id) if created_by_user_id else None,
            "created_by_display_name": str(created_by_display_name) if created_by_display_name else None,
            "source_action": source_action,
            "change_reason": change_reason,
        }
        created = await self.repository.create_version(version_doc)
        logger.info(
            "prompt_version_snapshot_created",
            subcategory_id=subcategory_id,
            version_id=created.get("id"),
            source_action=source_action,
        )
        return created

    async def list_versions(
        self,
        subcategory_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        items = await self.repository.list_versions_by_subcategory(subcategory_id)

        items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
        total = len(items)
        sliced = items[offset : offset + limit]

        return {
            "versions": [self._metadata(item) for item in sliced],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(sliced) < total,
        }

    async def get_version(self, subcategory_id: str, version_id: str) -> Optional[Dict[str, Any]]:
        item = await self.repository.get_version(version_id)
        if not item:
            return None

        if item.get("type") != "prompt_subcategory_version":
            return None
        if item.get("subcategory_id") != subcategory_id:
            return None
        return item

    async def _resolve_reference(
        self,
        *,
        subcategory_id: str,
        ref: str,
        current_subcategory: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        if ref == "current":
            current = current_subcategory or await self.prompt_service.get_subcategory(subcategory_id)
            if not current:
                raise ValueError(f"Current subcategory '{subcategory_id}' not found")
            metadata = {
                "id": "current",
                "created_at": current.get("updated_at"),
                "created_by_user_id": current.get("updated_by_user_id"),
                "created_by_display_name": current.get("updated_by_display_name"),
                "source_action": "current",
                "change_reason": None,
            }
            return copy.deepcopy(current), metadata

        version = await self.get_version(subcategory_id, ref)
        if not version:
            raise ValueError(f"Version '{ref}' not found for subcategory '{subcategory_id}'")
        return copy.deepcopy(version.get("snapshot") or {}), self._metadata(version)

    async def diff_versions(
        self,
        *,
        subcategory_id: str,
        left: str,
        right: str,
        current_subcategory: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        left_snapshot, left_meta = await self._resolve_reference(
            subcategory_id=subcategory_id,
            ref=left,
            current_subcategory=current_subcategory,
        )
        right_snapshot, right_meta = await self._resolve_reference(
            subcategory_id=subcategory_id,
            ref=right,
            current_subcategory=current_subcategory,
        )

        left_text = self._to_text(left_snapshot)
        right_text = self._to_text(right_snapshot)
        added, removed = self._count_diff_lines(left_text, right_text)

        return {
            "left": left_meta,
            "right": right_meta,
            "left_text": left_text,
            "right_text": right_text,
            "summary": {
                "added": added,
                "removed": removed,
            },
        }

    async def rollback_to_version(
        self,
        *,
        subcategory_id: str,
        version_id: str,
        actor_user_id: Optional[str],
        actor_display_name: Optional[str],
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        current = await self.prompt_service.get_subcategory(subcategory_id)
        if not current:
            raise ValueError(f"Subcategory '{subcategory_id}' not found")

        target_version = await self.get_version(subcategory_id, version_id)
        if not target_version:
            raise ValueError(f"Version '{version_id}' not found for subcategory '{subcategory_id}'")

        await self.create_version_snapshot(
            subcategory=current,
            created_by_user_id=actor_user_id,
            created_by_display_name=actor_display_name,
            source_action="rollback_pre",
            change_reason=reason or "Rollback requested",
        )

        snapshot = copy.deepcopy(target_version.get("snapshot") or {})
        restored = copy.deepcopy(snapshot)
        restored["id"] = subcategory_id
        restored["type"] = "prompt_subcategory"
        restored["updated_at"] = self._now_ms()
        if "created_at" not in restored:
            restored["created_at"] = current.get("created_at", restored["updated_at"])

        if actor_user_id:
            restored["updated_by_user_id"] = str(actor_user_id)
        if actor_display_name:
            restored["updated_by_display_name"] = str(actor_display_name)

        updated = await self.repository.save_subcategory(restored)

        PromptService._invalidate_subcategory_cache_for(current.get("category_id"))
        PromptService._invalidate_subcategory_cache_for(updated.get("category_id"))
        PromptService._invalidate_subcategory_cache_for(None)

        await self.create_version_snapshot(
            subcategory=updated,
            created_by_user_id=actor_user_id,
            created_by_display_name=actor_display_name,
            source_action="rollback_post",
            change_reason=reason or "Rollback completed",
        )

        logger.info(
            "prompt_version_rollback_completed",
            subcategory_id=subcategory_id,
            version_id=version_id,
            actor_user_id=actor_user_id,
        )
        return updated
