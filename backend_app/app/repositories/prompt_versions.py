from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


class PromptVersionRepository:
    """Persistence operations for prompt subcategory version history."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _container(self):
        return self.cosmos.get_container("prompts")

    async def create_version(self, version_doc: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().create_item(body=version_doc)

    async def list_versions_by_subcategory(self, subcategory_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM c WHERE c.type = 'prompt_subcategory_version' AND c.subcategory_id = @subcategory_id"
        parameters = [{"name": "@subcategory_id", "value": subcategory_id}]
        iterator = self._container().query_items(query=query, parameters=parameters)
        return [item async for item in iterator]

    async def get_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._container().read_item(item=version_id, partition_key=version_id)
        except CosmosResourceNotFoundError:
            return None

    async def save_subcategory(self, subcategory: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().upsert_item(body=subcategory)
