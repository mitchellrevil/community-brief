"""Read-side prompt workflows and visibility filtering."""
from __future__ import annotations
from typing import Any, Dict, List, Optional

from ...core.config import DatabaseError
from ...core.errors.domain import ApplicationError, ErrorCode, ResourceNotFoundError
from ...models.permissions import PermissionLevel, has_permission_level
from ...models.prompt_visibility import (
    can_user_access_subcategory,
    normalize_prompt_visibility,
)
from ...utils.cache_utils import TTLCache
from ...services.interfaces import PromptServiceInterface, TalkingPointsServiceInterface


class PromptReadService:
    _list_subcategories_cache = TTLCache[Dict[str, Any]](default_ttl=600.0)
    _retrieve_prompts_cache = TTLCache[Dict[str, Any]](default_ttl=600.0)

    def __init__(
        self,
        *,
        prompt_service: PromptServiceInterface,
        talking_points_service: TalkingPointsServiceInterface | None = None,
    ) -> None:
        self.prompt_service = prompt_service
        self.talking_points_service = talking_points_service

    async def list_subcategories(
        self,
        *,
        category_id: Optional[str],
        limit: int,
        offset: int,
        include_hidden: bool,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        cache_key = self._list_subcategories_cache_key(
            current_user=current_user,
            category_id=category_id,
            limit=limit,
            offset=offset,
            include_hidden=include_hidden,
        )

        async def compute() -> Dict[str, Any]:
            try:
                result = await self.prompt_service.list_subcategories(
                    category_id=category_id,
                    limit=limit,
                    offset=offset,
                )
            except DatabaseError as exc:
                raise self._database_unavailable("list prompt subcategories") from exc

            subcategories = result["items"]
            if not (include_hidden and self._is_editor(current_user)):
                subcategories = [
                    item for item in subcategories if can_user_access_subcategory(current_user, item)
                ]

            subcategories = [self._ensure_talking_points(item) for item in subcategories]

            return {
                "subcategories": subcategories,
                "total": len(subcategories),
                "limit": limit,
                "offset": offset,
                "has_more": False,
            }

        return await self._list_subcategories_cache.get_or_compute(cache_key, compute)

    async def get_subcategory(
        self,
        *,
        subcategory_id: str,
        current_user: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            subcategory = await self.prompt_service.get_subcategory(subcategory_id)
        except DatabaseError as exc:
            raise self._database_unavailable("retrieve prompt subcategory") from exc

        if not subcategory:
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)

        if not self._is_editor(current_user) and not can_user_access_subcategory(current_user, subcategory):
            raise ResourceNotFoundError("Prompt subcategory", subcategory_id)

        return self._ensure_talking_points(subcategory)

    async def retrieve_prompts(self, *, current_user: Dict[str, Any]) -> Dict[str, Any]:
        cache_key = self._retrieve_prompts_cache_key(current_user=current_user)

        async def compute() -> Dict[str, Any]:
            try:
                data = await self.prompt_service.retrieve_prompts_hierarchy()
            except DatabaseError as exc:
                raise self._database_unavailable("retrieve prompt hierarchy") from exc

            filtered_data: List[Dict[str, Any]] = []
            for category in data:
                visible_subcategories = [
                    {
                        **subcategory,
                        "prompt_visibility": normalize_prompt_visibility(subcategory.get("prompt_visibility")),
                    }
                    for subcategory in category.get("subcategories", [])
                    if can_user_access_subcategory(current_user, subcategory)
                ]
                filtered_data.append({**category, "subcategories": visible_subcategories})

            return {"status": 200, "data": filtered_data}

        return await self._retrieve_prompts_cache.get_or_compute(cache_key, compute)

    def _ensure_talking_points(self, subcategory: Dict[str, Any]) -> Dict[str, Any]:
        if not self.talking_points_service:
            return subcategory
        return self.talking_points_service.ensure_talking_points_structure(subcategory)

    @classmethod
    async def invalidate_cached_responses(cls) -> None:
        await cls._list_subcategories_cache.clear()
        await cls._retrieve_prompts_cache.clear()

    def _is_editor(self, current_user: Dict[str, Any]) -> bool:
        return has_permission_level(
            (current_user or {}).get("permission"),
            PermissionLevel.EDITOR.value,
        )

    @staticmethod
    def _list_subcategories_cache_key(
        *,
        current_user: Dict[str, Any],
        category_id: Optional[str],
        limit: int,
        offset: int,
        include_hidden: bool,
    ) -> str:
        return (
            f"{current_user.get('id')}:{current_user.get('permission')}:{include_hidden}:"
            f"{category_id}:{limit}:{offset}"
        )

    @staticmethod
    def _retrieve_prompts_cache_key(*, current_user: Dict[str, Any]) -> str:
        return f"{current_user.get('id')}:{current_user.get('permission')}"

    def _database_unavailable(self, action: str) -> ApplicationError:
        return ApplicationError(
            "Database service unavailable",
            ErrorCode.SERVICE_UNAVAILABLE,
            status_code=503,
            details={"action": action},
        )
