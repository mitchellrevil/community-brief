from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


class JobRepository:
    """Cosmos persistence for job records."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("jobs")

    async def get_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self.container.read_item(item=job_id, partition_key=job_id)
            if item.get("type") != "job":
                return None
            return item
        except CosmosResourceNotFoundError:
            return None

    async def query(self, query: str, parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        query_iterator = self.container.query_items(query=query, parameters=parameters)
        return [item async for item in query_iterator]

    async def create(self, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        return await self.container.create_item(body=job_doc)

    async def replace(self, job_id: str, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        return await self.container.replace_item(item=job_id, body=job_doc)

    async def delete(self, job_id: str) -> bool:
        try:
            await self.container.delete_item(item=job_id, partition_key=job_id)
            return True
        except CosmosResourceNotFoundError:
            return False
