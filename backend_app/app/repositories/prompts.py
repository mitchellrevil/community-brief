from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


class PromptRepository:
    """Persistence operations for prompt categories and subcategories."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _container(self):
        return self.cosmos.get_container("prompts")

    async def list_categories(self) -> List[Dict[str, Any]]:
        iterator = self._container().query_items(
            query="SELECT * FROM c WHERE c.type = 'prompt_category'"
        )
        return [item async for item in iterator]

    async def create_category(self, category_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().create_item(body=category_data)

    async def get_category(self, category_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self._container().read_item(item=category_id, partition_key=category_id)
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict):
            return None
        if item.get("type") != "prompt_category":
            return None
        return item

    async def save_category(self, category_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().upsert_item(body=category_data)

    async def list_subcategory_ids_by_category(self, category_id: str) -> List[str]:
        query = "SELECT c.id FROM c WHERE c.type = 'prompt_subcategory' AND c.category_id = @category_id"
        parameters = [{"name": "@category_id", "value": category_id}]
        iterator = self._container().query_items(query=query, parameters=parameters)
        return [item["id"] async for item in iterator]

    async def list_subcategories(self, category_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if category_id:
            query = "SELECT * FROM c WHERE c.type = 'prompt_subcategory' AND c.category_id = @category_id"
            parameters = [{"name": "@category_id", "value": category_id}]
            iterator = self._container().query_items(query=query, parameters=parameters)
        else:
            query = "SELECT * FROM c WHERE c.type = 'prompt_subcategory'"
            iterator = self._container().query_items(query=query)
        return [item async for item in iterator]

    async def create_subcategory(self, subcategory_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().create_item(body=subcategory_data)

    async def get_subcategory(self, subcategory_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self._container().read_item(item=subcategory_id, partition_key=subcategory_id)
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict):
            return None
        if item.get("type") != "prompt_subcategory":
            return None
        return item

    async def save_subcategory(self, subcategory_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._container().upsert_item(body=subcategory_data)

    async def _delete_document(self, item_id: str) -> None:
        await self._container().delete_item(item=item_id, partition_key=item_id)

    async def delete_category_and_subcategories(self, category_id: str) -> None:
        item_ids = await self.list_subcategory_ids_by_category(category_id)
        item_ids.append(category_id)

        for index in range(0, len(item_ids), 100):
            for item_id in item_ids[index:index + 100]:
                await self._delete_document(item_id)

    async def delete_subcategory(self, subcategory_id: str) -> None:
        await self._delete_document(subcategory_id)
