from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService
from .prompts import meeting_type_from_document, meeting_type_to_document


class PromptVersionRepository:
    """Persistence operations for prompt subcategory version history."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _container(self):
        return self.cosmos.get_container("prompts")

    async def create_version(self, version_doc: Dict[str, Any]) -> Dict[str, Any]:
        document = dict(version_doc)
        document["subcategory_id"] = document.pop("template_id")
        document["snapshot"] = meeting_type_to_document(document.get("snapshot") or {})
        created = await self._container().create_item(body=document)
        return self._from_document(created)

    async def list_versions_by_meeting_type(self, meeting_type_id: str) -> List[Dict[str, Any]]:
        query = (
            "SELECT c.id, c.created_at, c.created_by_user_id, "
            "c.created_by_display_name, c.source_action, c.change_reason "
            "FROM c WHERE c.type = 'prompt_subcategory_version' "
            "AND c.subcategory_id = @subcategory_id"
        )
        parameters = [{"name": "@subcategory_id", "value": meeting_type_id}]
        iterator = self._container().query_items(query=query, parameters=parameters)
        return [item async for item in iterator]

    async def get_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        try:
            document = await self._container().read_item(
                item=version_id, partition_key=version_id
            )
        except CosmosResourceNotFoundError:
            return None
        return self._from_document(document)

    @staticmethod
    def _from_document(document: Dict[str, Any]) -> Dict[str, Any]:
        version = dict(document)
        version["template_id"] = version.pop("subcategory_id", None)
        version["snapshot"] = meeting_type_from_document(version.get("snapshot") or {})
        return version
