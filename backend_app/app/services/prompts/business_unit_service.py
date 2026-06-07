from typing import List, Optional, Dict, Any
import copy

from ...core.logging import get_logger
from ...repositories.business_units import BusinessUnitStatsRepository
from ...utils.cache_utils import TTLCache

logger = get_logger(__name__)

_business_unit_list_cache = TTLCache[Dict[str, Any]](default_ttl=60.0)


class BusinessUnitService:
    """Encapsulates business-unit related operations used by routers.

    This is a thin wrapper around existing PromptService and UserService
    methods so routers can delegate orchestration and permission checks.
    """

    def __init__(
        self,
        prompt_service,
        user_service=None,
        stats_repository: BusinessUnitStatsRepository | None = None,
    ):
        self.prompt_service = prompt_service
        self.user_service = user_service
        self.stats_repository = stats_repository

    async def create_business_unit(self, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        category = await self.prompt_service.async_create_category(name=name, parent_category_id=None)
        if description:
            category["description"] = description
        await self._invalidate_cached_lists()
        return category

    async def list_business_units(self, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        cache_key = f"{limit}:{offset}"
        cached = await _business_unit_list_cache.get(cache_key)
        if cached is not None:
            return copy.deepcopy(cached)

        all_result = await self.prompt_service.list_categories(limit=1000, offset=0)
        all_categories = all_result.get("items", [])
        all_business_units = [cat for cat in all_categories if cat.get("parent_category_id") is None]
        total = len(all_business_units)
        paginated = all_business_units[offset: offset + limit]
        result = {"items": paginated, "total": total, "limit": limit, "offset": offset}
        await _business_unit_list_cache.set(cache_key, copy.deepcopy(result))
        return result

    async def get_business_unit(self, bu_id: str) -> Optional[Dict[str, Any]]:
        return await self.prompt_service.async_get_category(bu_id)

    async def update_business_unit(self, bu_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        updated = await self.prompt_service.async_update_category(category_id=bu_id, name=name, parent_category_id=None)
        if description is not None:
            updated["description"] = description
        await self._invalidate_cached_lists()
        return updated

    async def assign_user_business_units(self, user_id: str, business_unit_ids: List[str], user_service):
        return await user_service.set_user_business_units(target_user_id=user_id, business_unit_ids=business_unit_ids)

    async def get_business_unit_stats(self, business_unit_id: str) -> Dict[str, Any]:
        if self.stats_repository is None:
            raise RuntimeError("BusinessUnitStatsRepository is required for business unit stats")
        stats = await self.stats_repository.get_stats(business_unit_id)
        return {
            "business_unit_id": business_unit_id,
            **stats,
        }

    @staticmethod
    async def _invalidate_cached_lists() -> None:
        await _business_unit_list_cache.clear()
