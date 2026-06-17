from typing import List, Dict, Any, Optional, Set
import asyncio
import time
from datetime import UTC, datetime
import uuid

from azure.cosmos import exceptions as cosmos_exceptions

from ...core.logging import get_logger
from ...models.prompt_visibility import (
    DEFAULT_PROMPT_VISIBILITY,
    normalize_prompt_visibility,
    normalize_visible_to_user_ids,
)
from ...repositories.prompts import PromptRepository

logger = get_logger(__name__)

# Sentinel value to distinguish "not provided" from "explicitly None"
_NOT_PROVIDED = object()


class PromptService:
    _CATEGORY_CACHE_TTL_SECONDS = 600.0
    _categories_cache: Optional[List[Dict[str, Any]]] = None
    _categories_cache_by_id: Dict[str, Dict[str, Any]] = {}
    _categories_cache_timestamp: float = 0.0
    _category_cache_lock: asyncio.Lock = asyncio.Lock()

    _SUBCATEGORY_CACHE_TTL_SECONDS = 600.0
    _subcategory_cache: Dict[str, List[Dict[str, Any]]] = {}
    _subcategory_cache_by_id: Dict[str, Dict[str, Any]] = {}
    _subcategory_cache_timestamps: Dict[str, float] = {}
    _subcategory_cache_lock: asyncio.Lock = asyncio.Lock()

    @staticmethod
    def _snapshot_sort_key(item: Dict[str, Any]) -> tuple:
        name = str(item.get("name") or "").lower()
        item_id = str(item.get("id") or "")
        return (name, item_id)

    def __init__(self, repository: PromptRepository):
        self.logger = logger
        self.repository = repository
        self._business_unit_cache: Dict[str, str] = {}

    @classmethod
    def _invalidate_category_cache(cls) -> None:
        cls._categories_cache = None
        cls._categories_cache_by_id = {}
        cls._categories_cache_timestamp = 0.0

    async def _get_categories_snapshot(self) -> List[Dict[str, Any]]:
        cls = type(self)
        now = time.monotonic()
        if cls._categories_cache is not None and now - cls._categories_cache_timestamp < cls._CATEGORY_CACHE_TTL_SECONDS:
            return cls._categories_cache

        async with cls._category_cache_lock:
            now = time.monotonic()
            if cls._categories_cache is not None and now - cls._categories_cache_timestamp < cls._CATEGORY_CACHE_TTL_SECONDS:
                return cls._categories_cache

            categories = await self.repository.list_categories()
            categories.sort(key=self._snapshot_sort_key)
            cls._categories_cache = categories
            cls._categories_cache_by_id = {
                item["id"]: item
                for item in categories
                if item.get("id")
            }
            cls._categories_cache_timestamp = time.monotonic()
            return cls._categories_cache

    async def get_categories_by_ids(self, category_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not category_ids:
            return {}

        categories = await self._get_categories_snapshot()
        requested_ids: Set[str] = {cid for cid in category_ids if cid}
        if not requested_ids:
            return {}

        return {
            category["id"]: category
            for category in categories
            if category.get("id") in requested_ids
        }

    @classmethod
    def _subcategory_cache_key(cls, category_id: Optional[str]) -> str:
        return category_id or "__all__"

    @classmethod
    def _invalidate_subcategory_cache_for(cls, category_id: Optional[str]) -> None:
        key = cls._subcategory_cache_key(category_id)
        cls._subcategory_cache.pop(key, None)
        cls._subcategory_cache_timestamps.pop(key, None)
        if category_id is None:
            cls._subcategory_cache_by_id = {}

    async def _get_subcategories_snapshot(
        self,
        category_id: Optional[str],
    ) -> List[Dict[str, Any]]:
        cls = type(self)
        key = cls._subcategory_cache_key(category_id)
        now = time.monotonic()
        cached_items = cls._subcategory_cache.get(key)
        cached_at = cls._subcategory_cache_timestamps.get(key, 0.0)
        if cached_items is not None and now - cached_at < cls._SUBCATEGORY_CACHE_TTL_SECONDS:
            return cached_items

        async with cls._subcategory_cache_lock:
            now = time.monotonic()
            cached_items = cls._subcategory_cache.get(key)
            cached_at = cls._subcategory_cache_timestamps.get(key, 0.0)
            if cached_items is not None and now - cached_at < cls._SUBCATEGORY_CACHE_TTL_SECONDS:
                return cached_items

            items = await self.repository.list_subcategories(category_id)
            items.sort(key=cls._snapshot_sort_key)
            cls._subcategory_cache[key] = items
            cls._subcategory_cache_timestamps[key] = time.monotonic()
            if key == "__all__":
                cls._subcategory_cache_by_id = {
                    item["id"]: item
                    for item in items
                    if item.get("id")
                }
            return items

    async def get_business_unit_id_from_category(self, category_id: str) -> Optional[str]:
        if category_id in self._business_unit_cache:
            return self._business_unit_cache[category_id]

        cached_business_unit_id = self._resolve_business_unit_id_from_category_snapshot(category_id)
        if cached_business_unit_id:
            self._business_unit_cache[category_id] = cached_business_unit_id
            return cached_business_unit_id

        category = await self.get_category(category_id)
        if not category:
            self.logger.warning("prompt_category_not_found", category_id=category_id)
            return None
        type(self)._categories_cache_by_id[category_id] = category

        business_unit_id = category.get("business_unit_id")
        if business_unit_id:
            self._business_unit_cache[category_id] = business_unit_id
            return business_unit_id
        
        parent_id = category.get("parent_category_id")
        if parent_id is None:
            self._business_unit_cache[category_id] = category_id
            return category_id
        
        business_unit_id = await self.get_business_unit_id_from_category(parent_id)
        if business_unit_id:
            self._business_unit_cache[category_id] = business_unit_id
        return business_unit_id

    def _resolve_business_unit_id_from_category_snapshot(self, category_id: str) -> Optional[str]:
        categories_by_id = type(self)._categories_cache_by_id
        if not categories_by_id:
            return None

        resolved: Dict[str, Optional[str]] = {}

        def _resolve(current_id: Optional[str]) -> Optional[str]:
            if not current_id:
                return None
            if current_id in resolved:
                return resolved[current_id]

            category = categories_by_id.get(current_id)
            if not category:
                return None

            business_unit_id = category.get("business_unit_id")
            if business_unit_id:
                resolved[current_id] = business_unit_id
                return business_unit_id

            parent_id = category.get("parent_category_id")
            if not parent_id:
                resolved[current_id] = current_id
                return current_id

            parent_business_unit_id = _resolve(parent_id)
            if parent_business_unit_id:
                resolved[current_id] = parent_business_unit_id
            return parent_business_unit_id

        return _resolve(category_id)

    async def async_get_business_unit_id_from_category(self, category_id: str) -> Optional[str]:
        return await self.get_business_unit_id_from_category(category_id)

    def clear_business_unit_cache(self):
        self._business_unit_cache.clear()

    async def _invalidate_prompt_read_caches(self) -> None:
        from .prompt_read_service import PromptReadService

        await PromptReadService.invalidate_cached_responses()

    async def create_category(self, name: str, parent_category_id: Optional[str] = None) -> Dict[str, Any]:
        timestamp = int(datetime.now(UTC).timestamp() * 1000)
        category_id = f"category_{timestamp}"
        
        if parent_category_id is None:
            is_business_unit = True
            business_unit_id = category_id
        else:
            is_business_unit = False
            business_unit_id = await self.get_business_unit_id_from_category(parent_category_id)
            if not business_unit_id:
                raise ValueError(f"Cannot determine business unit for parent category {parent_category_id}")
        
        category_data = {
            "id": category_id,
            "type": "prompt_category",
            "name": name,
            "created_at": timestamp,
            "updated_at": timestamp,
            "parent_category_id": parent_category_id,
            "is_business_unit": is_business_unit,
            "business_unit_id": business_unit_id,
        }
        result = await self.repository.create_category(category_data)
        self._invalidate_category_cache()
        self.clear_business_unit_cache()
        await self._invalidate_prompt_read_caches()
        return result

    async def async_create_category(self, name: str, parent_category_id: Optional[str] = None) -> Dict[str, Any]:
        return await self.create_category(name, parent_category_id)

    async def list_categories(self, limit: Optional[int] = None, offset: int = 0) -> Dict[str, Any]:
        categories = await self._get_categories_snapshot()

        total = len(categories)
        if offset >= total:
            sliced: List[Dict[str, Any]] = []
        else:
            end_index = offset + limit if limit is not None else total
            sliced = categories[offset:end_index]

        items = [dict(item) for item in sliced]
        applied_limit = limit if limit is not None else total

        return {
            "items": items,
            "total": total,
            "limit": applied_limit,
            "offset": offset
        }

    async def async_list_categories(self, limit: Optional[int] = None, offset: int = 0) -> List[Dict[str, Any]]:
        result = await self.list_categories(limit=limit, offset=offset)
        return result["items"]

    async def get_category(self, category_id: str) -> Optional[Dict[str, Any]]:
        return await self.repository.get_category(category_id)

    async def async_get_category(self, category_id: str) -> Optional[Dict[str, Any]]:
        return await self.get_category(category_id)

    async def get_subcategory_inference_settings(self, subcategory_id: str) -> Optional[Dict[str, Any]]:
        """Get inference settings (model, reasoning, verbosity, provider, parameters) for a prompt subcategory.
        
        Returns dict with:
            - analysis_model: Optional[str]
            - analysis_reasoning: Optional[str]
            - analysis_verbosity: Optional[str]
            - analysis_provider: Optional[str]
            - provider_parameters: Optional[Dict[str, Any]]
        
        Returns None if subcategory not found.
        """
        item = type(self)._subcategory_cache_by_id.get(subcategory_id)
        if item is None:
            await self._get_subcategories_snapshot(None)
            item = type(self)._subcategory_cache_by_id.get(subcategory_id)
        if item is None:
            item = await self.repository.get_subcategory(subcategory_id)
            if item:
                type(self)._subcategory_cache_by_id[subcategory_id] = item
        if not item:
            return None
        
        # Extract only inference settings
        return {
            "analysis_model": item.get("analysis_model"),
            "analysis_reasoning": item.get("analysis_reasoning"),
            "analysis_verbosity": item.get("analysis_verbosity"),
            "analysis_provider": item.get("analysis_provider"),
            "provider_parameters": item.get("provider_parameters"),
            "enhanced_reasoning_enabled": item.get("enhanced_reasoning_enabled", False),
            "prompt_constraints": item.get("prompt_constraints"),
        }

    async def update_category(self, category_id: str, name: str, parent_category_id: Optional[str] = None) -> Dict[str, Any]:
        existing = await self.get_category(category_id)
        if not existing:
            return None
        
        existing["name"] = name
        
        if parent_category_id is not None and parent_category_id != existing.get("parent_category_id"):
            current_bu = existing.get("business_unit_id")
            
            if parent_category_id is None:
                new_bu = category_id
            else:
                new_bu = await self.get_business_unit_id_from_category(parent_category_id)
            
            if current_bu and new_bu and current_bu != new_bu:
                raise ValueError(
                    f"Cannot move category across business units. "
                    f"Current BU: {current_bu}, Target BU: {new_bu}"
                )
            
            existing["parent_category_id"] = parent_category_id
            existing["business_unit_id"] = new_bu
        
        existing["updated_at"] = int(datetime.now(UTC).timestamp() * 1000)
        result = await self.repository.save_category(existing)
        self._invalidate_category_cache()
        self.clear_business_unit_cache()
        await self._invalidate_prompt_read_caches()
        return result

    async def async_update_category(self, category_id: str, name: str, parent_category_id: Optional[str] = None) -> Dict[str, Any]:
        return await self.update_category(category_id, name, parent_category_id)

    async def delete_category_and_subcategories(self, category_id: str) -> None:
        try:
            await self.repository.delete_category_and_subcategories(category_id)
        except cosmos_exceptions.CosmosHttpResponseError as e:
            logger.error("prompt_category_delete_failed", category_id=category_id, error=str(e))
            raise
        else:
            self._invalidate_category_cache()
            self.clear_business_unit_cache()
            self._invalidate_subcategory_cache_for(category_id)
            self._invalidate_subcategory_cache_for(None)
            await self._invalidate_prompt_read_caches()

    async def async_delete_category_and_subcategories(self, category_id: str) -> None:
        return await self.delete_category_and_subcategories(category_id)

    # Subcategory operations
    async def create_subcategory(
        self, 
        category_id: str, 
        name: str, 
        prompts: Dict[str, str], 
        pre: List[Dict[str, Any]], 
        in_session: List[Dict[str, Any]], 
        analysis_model: Optional[str] = None, 
        analysis_reasoning: Optional[str] = None, 
        analysis_verbosity: Optional[str] = None,
        analysis_provider: Optional[str] = None,
        provider_parameters: Optional[Dict[str, Any]] = None,
        prompt_visibility: str = DEFAULT_PROMPT_VISIBILITY,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
        visible_to_user_ids: Optional[List[str]] = None,
        enhanced_reasoning_enabled: bool = False,
        prompt_constraints: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        timestamp = int(datetime.now(UTC).timestamp() * 1000)
        subcategory_id = f"subcategory_{timestamp}_{uuid.uuid4().hex}"
        
        business_unit_id = await self.get_business_unit_id_from_category(category_id)
        if not business_unit_id:
            raise ValueError(f"Cannot determine business unit for category {category_id}")
        
        subcategory_data = {
            "id": subcategory_id,
            "type": "prompt_subcategory",
            "category_id": category_id,
            "name": name,
            "prompts": prompts or {},
            "preSessionTalkingPoints": pre or [],
            "inSessionTalkingPoints": in_session or [],
            "created_at": timestamp,
            "updated_at": timestamp,
            "business_unit_id": business_unit_id,
            "prompt_visibility": normalize_prompt_visibility(prompt_visibility),
        }

        # Explicit user allowlist for meeting type visibility
        normalized_allowlist = normalize_visible_to_user_ids(visible_to_user_ids)
        if normalized_allowlist:
            subcategory_data["visible_to_user_ids"] = normalized_allowlist

        # Audit metadata: who last created/updated this prompt subcategory.
        # Stored redundantly (id + display name) to avoid extra lookups.
        if updated_by_user_id:
            subcategory_data["updated_by_user_id"] = str(updated_by_user_id)
        if updated_by_display_name:
            subcategory_data["updated_by_display_name"] = str(updated_by_display_name)
        
        # Add inference configuration fields if provided
        if analysis_model is not None:
            subcategory_data["analysis_model"] = analysis_model
        if analysis_reasoning is not None:
            subcategory_data["analysis_reasoning"] = analysis_reasoning
        if analysis_verbosity is not None:
            subcategory_data["analysis_verbosity"] = analysis_verbosity
        if analysis_provider is not None:
            subcategory_data["analysis_provider"] = analysis_provider
        if provider_parameters is not None:
            subcategory_data["provider_parameters"] = provider_parameters
        if enhanced_reasoning_enabled:
            subcategory_data["enhanced_reasoning_enabled"] = True
        if prompt_constraints is not None:
            subcategory_data["prompt_constraints"] = prompt_constraints
        
        result = await self.repository.create_subcategory(subcategory_data)
        self._invalidate_subcategory_cache_for(category_id)
        self._invalidate_subcategory_cache_for(None)
        await self._invalidate_prompt_read_caches()
        return result

    async def async_create_subcategory(
        self, 
        category_id: str, 
        name: str, 
        prompts: Dict[str, str], 
        pre: List[Dict[str, Any]], 
        in_session: List[Dict[str, Any]], 
        analysis_model: Optional[str] = None, 
        analysis_reasoning: Optional[str] = None, 
        analysis_verbosity: Optional[str] = None,
        analysis_provider: Optional[str] = None,
        provider_parameters: Optional[Dict[str, Any]] = None,
        prompt_visibility: str = DEFAULT_PROMPT_VISIBILITY,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
        visible_to_user_ids: Optional[List[str]] = None,
        enhanced_reasoning_enabled: bool = False,
        prompt_constraints: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        return await self.create_subcategory(
            category_id, name, prompts, pre, in_session, 
            analysis_model, analysis_reasoning, analysis_verbosity,
            analysis_provider, provider_parameters, prompt_visibility,
            updated_by_user_id, updated_by_display_name,
            visible_to_user_ids,
            enhanced_reasoning_enabled, prompt_constraints,
        )

    async def list_subcategories(self, category_id: Optional[str] = None, limit: Optional[int] = None, offset: int = 0) -> Dict[str, Any]:
        snapshot = await self._get_subcategories_snapshot(category_id)
        categories_by_id = type(self)._categories_cache_by_id
        if not categories_by_id:
            await self._get_categories_snapshot()
            categories_by_id = type(self)._categories_cache_by_id

        total = len(snapshot)
        if offset >= total:
            paged: List[Dict[str, Any]] = []
        else:
            end_index = offset + limit if limit is not None else total
            paged = snapshot[offset:end_index]

        items = [dict(item) for item in paged]
        for item in items:
            category_ref = item.get("category_id")
            derived_business_unit_id = self._resolve_business_unit_id_from_category_snapshot(category_ref) if category_ref else None
            if derived_business_unit_id is None and category_ref:
                derived_business_unit_id = await self.get_business_unit_id_from_category(category_ref)
            if derived_business_unit_id:
                item["business_unit_id"] = derived_business_unit_id
            item["prompt_visibility"] = normalize_prompt_visibility(item.get("prompt_visibility"))
            item["visible_to_user_ids"] = normalize_visible_to_user_ids(item.get("visible_to_user_ids"))
        applied_limit = limit if limit is not None else total

        return {
            "items": items,
            "total": total,
            "limit": applied_limit,
            "offset": offset
        }

    async def async_list_subcategories(self, category_id: Optional[str] = None, limit: Optional[int] = None, offset: int = 0) -> List[Dict[str, Any]]:
        result = await self.list_subcategories(category_id=category_id, limit=limit, offset=offset)
        return result["items"]

    async def get_subcategory(self, subcategory_id: str) -> Optional[Dict[str, Any]]:
        item = await self.repository.get_subcategory(subcategory_id)
        if not item:
            return None
        type(self)._subcategory_cache_by_id[subcategory_id] = item
        category_ref = item.get("category_id")
        derived_business_unit_id = self._resolve_business_unit_id_from_category_snapshot(category_ref) if category_ref else None
        if derived_business_unit_id is None and category_ref:
            derived_business_unit_id = await self.get_business_unit_id_from_category(category_ref)
        if derived_business_unit_id:
            item["business_unit_id"] = derived_business_unit_id
        item["prompt_visibility"] = normalize_prompt_visibility(item.get("prompt_visibility"))
        item["visible_to_user_ids"] = normalize_visible_to_user_ids(item.get("visible_to_user_ids"))
        return item

    async def async_get_subcategory(self, subcategory_id: str) -> Optional[Dict[str, Any]]:
        return await self.get_subcategory(subcategory_id)

    async def update_subcategory(
        self, 
        subcategory_id: str, 
        name: str, 
        prompts: Dict[str, str], 
        pre: List[Dict[str, Any]], 
        in_session: List[Dict[str, Any]], 
        analysis_model: Optional[str] = _NOT_PROVIDED, 
        analysis_reasoning: Optional[str] = _NOT_PROVIDED, 
        analysis_verbosity: Optional[str] = _NOT_PROVIDED,
        analysis_provider: Optional[str] = _NOT_PROVIDED,
        provider_parameters: Optional[Dict[str, Any]] = _NOT_PROVIDED,
        prompt_visibility: Optional[str] = _NOT_PROVIDED,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
        visible_to_user_ids: Optional[List[str]] = _NOT_PROVIDED,
        enhanced_reasoning_enabled: Optional[bool] = _NOT_PROVIDED,
        prompt_constraints: Optional[Dict] = _NOT_PROVIDED,
    ) -> Optional[Dict[str, Any]]:
        existing = await self.get_subcategory(subcategory_id)
        if not existing:
            return None
        existing["name"] = name
        existing["prompts"] = prompts or {}
        existing["preSessionTalkingPoints"] = pre or []
        existing["inSessionTalkingPoints"] = in_session or []
        derived_business_unit_id = await self.get_business_unit_id_from_category(existing.get("category_id"))
        if derived_business_unit_id:
            existing["business_unit_id"] = derived_business_unit_id
        
        # Update inference configuration fields
        # When a parameter is explicitly provided (including None), update/clear it.
        # When not provided (_NOT_PROVIDED), preserve existing value.
        if analysis_model is not _NOT_PROVIDED:
            if analysis_model is None:
                existing.pop("analysis_model", None)
            else:
                existing["analysis_model"] = analysis_model
        
        if analysis_reasoning is not _NOT_PROVIDED:
            if analysis_reasoning is None:
                existing.pop("analysis_reasoning", None)
            else:
                existing["analysis_reasoning"] = analysis_reasoning
        
        if analysis_verbosity is not _NOT_PROVIDED:
            if analysis_verbosity is None:
                existing.pop("analysis_verbosity", None)
            else:
                existing["analysis_verbosity"] = analysis_verbosity
        
        if analysis_provider is not _NOT_PROVIDED:
            if analysis_provider is None:
                existing.pop("analysis_provider", None)
            else:
                existing["analysis_provider"] = analysis_provider
        
        if provider_parameters is not _NOT_PROVIDED:
            if provider_parameters is None:
                existing.pop("provider_parameters", None)
            else:
                existing["provider_parameters"] = provider_parameters

        if enhanced_reasoning_enabled is not _NOT_PROVIDED:
            if enhanced_reasoning_enabled:
                existing["enhanced_reasoning_enabled"] = True
            else:
                existing.pop("enhanced_reasoning_enabled", None)

        if prompt_constraints is not _NOT_PROVIDED:
            if prompt_constraints is None:
                existing.pop("prompt_constraints", None)
            else:
                existing["prompt_constraints"] = prompt_constraints

        if prompt_visibility is not _NOT_PROVIDED:
            existing["prompt_visibility"] = normalize_prompt_visibility(prompt_visibility)

        if visible_to_user_ids is not _NOT_PROVIDED:
            normalized_allowlist = normalize_visible_to_user_ids(visible_to_user_ids)
            if normalized_allowlist:
                existing["visible_to_user_ids"] = normalized_allowlist
            else:
                existing.pop("visible_to_user_ids", None)

        # Audit metadata
        if updated_by_user_id:
            existing["updated_by_user_id"] = str(updated_by_user_id)
        if updated_by_display_name:
            existing["updated_by_display_name"] = str(updated_by_display_name)
        
        existing["updated_at"] = int(datetime.now(UTC).timestamp() * 1000)
        result = await self.repository.save_subcategory(existing)
        result["prompt_visibility"] = normalize_prompt_visibility(result.get("prompt_visibility"))
        result["visible_to_user_ids"] = normalize_visible_to_user_ids(result.get("visible_to_user_ids"))
        self._invalidate_subcategory_cache_for(existing.get("category_id"))
        self._invalidate_subcategory_cache_for(None)
        await self._invalidate_prompt_read_caches()
        return result

    async def async_update_subcategory(
        self, 
        subcategory_id: str, 
        name: str, 
        prompts: Dict[str, str], 
        pre: List[Dict[str, Any]], 
        in_session: List[Dict[str, Any]], 
        analysis_model: Optional[str] = _NOT_PROVIDED,
        analysis_reasoning: Optional[str] = _NOT_PROVIDED,
        analysis_verbosity: Optional[str] = _NOT_PROVIDED,
        analysis_provider: Optional[str] = _NOT_PROVIDED,
        provider_parameters: Optional[Dict[str, Any]] = _NOT_PROVIDED,
        prompt_visibility: Optional[str] = _NOT_PROVIDED,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
        visible_to_user_ids: Optional[List[str]] = _NOT_PROVIDED,
        enhanced_reasoning_enabled: Optional[bool] = _NOT_PROVIDED,
        prompt_constraints: Optional[Dict] = _NOT_PROVIDED,
    ) -> Optional[Dict[str, Any]]:
        return await self.update_subcategory(
            subcategory_id, name, prompts, pre, in_session, 
            analysis_model, analysis_reasoning, analysis_verbosity,
            analysis_provider, provider_parameters, prompt_visibility,
            updated_by_user_id, updated_by_display_name,
            visible_to_user_ids,
            enhanced_reasoning_enabled, prompt_constraints,
        )

    async def delete_subcategory(self, subcategory_id: str) -> None:
        existing = await self.get_subcategory(subcategory_id)
        await self.repository.delete_subcategory(subcategory_id)
        if existing:
            self._invalidate_subcategory_cache_for(existing.get("category_id"))
        self._invalidate_subcategory_cache_for(None)
        await self._invalidate_prompt_read_caches()

    async def async_delete_subcategory(self, subcategory_id: str) -> None:
        return await self.delete_subcategory(subcategory_id)

    async def move_subcategory(
        self,
        subcategory_id: str,
        new_category_id: str,
        *,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        existing = await self.get_subcategory(subcategory_id)
        if not existing:
            return None
        
        new_category = await self.get_category(new_category_id)
        if not new_category:
            return None
        new_business_unit_id = await self.get_business_unit_id_from_category(new_category_id)
        
        original_category_id = existing.get("category_id")
        existing["category_id"] = new_category_id
        if new_business_unit_id:
            existing["business_unit_id"] = new_business_unit_id
        if updated_by_user_id:
            existing["updated_by_user_id"] = str(updated_by_user_id)
        if updated_by_display_name:
            existing["updated_by_display_name"] = str(updated_by_display_name)
        existing["updated_at"] = int(datetime.now(UTC).timestamp() * 1000)
        result = await self.repository.save_subcategory(existing)
        self._invalidate_subcategory_cache_for(original_category_id)
        self._invalidate_subcategory_cache_for(new_category_id)
        self._invalidate_subcategory_cache_for(None)
        await self._invalidate_prompt_read_caches()
        return result

    async def async_move_subcategory(
        self,
        subcategory_id: str,
        new_category_id: str,
        *,
        updated_by_user_id: Optional[str] = None,
        updated_by_display_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        return await self.move_subcategory(
            subcategory_id,
            new_category_id,
            updated_by_user_id=updated_by_user_id,
            updated_by_display_name=updated_by_display_name,
        )

    async def retrieve_prompts_hierarchy(self) -> List[Dict[str, Any]]:
        categories_list = await self._get_categories_snapshot()

        subcategories_list = await self._get_subcategories_snapshot(None)
        
        subcategories_by_category = {}
        for subcat in subcategories_list:
            category_id = subcat.get("category_id")
            if category_id not in subcategories_by_category:
                subcategories_by_category[category_id] = []
            subcategories_by_category[category_id].append({
                "subcategory_name": subcat.get("name"),
                "subcategory_id": subcat.get("id"),
                "prompts": subcat.get("prompts", []),
                "preSessionTalkingPoints": subcat.get("preSessionTalkingPoints", []),
                "inSessionTalkingPoints": subcat.get("inSessionTalkingPoints", []),
                "analysis_model": subcat.get("analysis_model"),
                "analysis_reasoning": subcat.get("analysis_reasoning"),
                "analysis_verbosity": subcat.get("analysis_verbosity"),
                "analysis_provider": subcat.get("analysis_provider"),
                "provider_parameters": subcat.get("provider_parameters"),
                "prompt_visibility": normalize_prompt_visibility(subcat.get("prompt_visibility")),
                "visible_to_user_ids": normalize_visible_to_user_ids(subcat.get("visible_to_user_ids")),
            })

        results = []
        for category in categories_list:
            category_id = category.get("id")
            category_data = {
                "category_name": category.get("name"),
                "category_id": category_id,
                "parent_category_id": category.get("parent_category_id"),
                "subcategories": subcategories_by_category.get(category_id, []),
            }
            results.append(category_data)

        return results

    async def async_retrieve_prompts_hierarchy(self) -> List[Dict[str, Any]]:
        return await self.retrieve_prompts_hierarchy()
