from typing import List, Optional, Dict, Any

from ...core.logging import get_logger
from ...repositories.business_units import BusinessUnitStatsRepository

logger = get_logger(__name__)

class BusinessUnitService:
    """Encapsulates business-unit operations used by the admin surface."""

    def __init__(
        self,
        prompt_store,
        user_service=None,
        stats_repository: BusinessUnitStatsRepository | None = None,
    ):
        self.prompt_store = prompt_store
        self.user_service = user_service
        self.stats_repository = stats_repository

    async def create_business_unit(self, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        category = await self.prompt_store.create_folder(name=name, parent_id=None)
        if description:
            category["description"] = description
        return category

    async def list_business_units(self, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        all_result = await self.prompt_store.list_folders(limit=None, offset=0)
        all_categories = all_result.get("items", [])
        all_business_units = [cat for cat in all_categories if cat.get("parent_id") is None]
        total = len(all_business_units)
        paginated = all_business_units[offset: offset + limit]
        return {"items": paginated, "total": total, "limit": limit, "offset": offset}

    async def get_business_unit(self, bu_id: str) -> Optional[Dict[str, Any]]:
        return await self.prompt_store.get_folder(bu_id)

    async def update_business_unit(self, bu_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        updated = await self.prompt_store.update_folder(bu_id, name=name)
        if description is not None:
            updated["description"] = description
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
