from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from ..core.cosmos import CosmosService


class BusinessUnitStatsRepository:
    """Cosmos reads for business-unit aggregate statistics."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _auth_container(self):
        return self.cosmos.get_container("auth")

    def _prompts_container(self):
        return self.cosmos.get_container("prompts")

    async def _query_items(self, container: Any, query: str, params: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        iterator = container.query_items(query=query, parameters=params)
        return [item async for item in iterator]

    async def get_stats(self, business_unit_id: str) -> Dict[str, int]:
        params = [{"name": "@bu_id", "value": business_unit_id}]

        user_query = "SELECT COUNT(1) as count FROM c WHERE ARRAY_CONTAINS(c.business_unit_ids, @bu_id)"
        editor_query = (
            "SELECT COUNT(1) as count FROM c "
            "WHERE ARRAY_CONTAINS(c.business_unit_ids, @bu_id) AND c.permission = 'Editor'"
        )
        category_query = "SELECT COUNT(1) as count FROM c WHERE c.business_unit_id = @bu_id AND c.type = 'prompt_category'"
        subcategory_query = (
            "SELECT COUNT(1) as count FROM c WHERE c.business_unit_id = @bu_id AND c.type = 'prompt_subcategory'"
        )
        subcategory_docs_query = (
            "SELECT c.prompts FROM c WHERE c.business_unit_id = @bu_id AND c.type = 'prompt_subcategory'"
        )

        auth_container = self._auth_container()
        prompts_container = self._prompts_container()

        user_results, editor_results, category_results, subcategory_results, subcategory_docs = await asyncio.gather(
            self._query_items(auth_container, user_query, params),
            self._query_items(auth_container, editor_query, params),
            self._query_items(prompts_container, category_query, params),
            self._query_items(prompts_container, subcategory_query, params),
            self._query_items(prompts_container, subcategory_docs_query, params),
        )

        return {
            "total_users": user_results[0]["count"] if user_results else 0,
            "total_editors": editor_results[0]["count"] if editor_results else 0,
            "total_categories": category_results[0]["count"] if category_results else 0,
            "total_subcategories": subcategory_results[0]["count"] if subcategory_results else 0,
            "total_prompts": sum(len(doc.get("prompts", {})) for doc in subcategory_docs),
        }
