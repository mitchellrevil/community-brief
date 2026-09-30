from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.core import MatchConditions
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


ACTIVE_FOLDER_TYPE = "prompt_category"
ACTIVE_TEMPLATE_TYPE = "prompt_subcategory"
DELETED_FOLDER_TYPE = "deleted_prompt_category"
DELETED_TEMPLATE_TYPE = "deleted_prompt_subcategory"


def folder_from_document(document: Dict[str, Any]) -> Dict[str, Any]:
    folder = dict(document)
    folder["parent_id"] = folder.pop("parent_category_id", None)
    folder.pop("type", None)
    return folder


def folder_to_document(folder: Dict[str, Any]) -> Dict[str, Any]:
    document = dict(folder)
    document["type"] = ACTIVE_FOLDER_TYPE
    document["parent_category_id"] = document.pop("parent_id", None)
    return document


def meeting_type_from_document(document: Dict[str, Any]) -> Dict[str, Any]:
    meeting_type = dict(document)
    meeting_type["folder_id"] = meeting_type.pop("category_id", None)
    meeting_type["pre_session_talking_points"] = meeting_type.pop(
        "preSessionTalkingPoints", []
    )
    meeting_type["in_session_talking_points"] = meeting_type.pop(
        "inSessionTalkingPoints", []
    )
    meeting_type["visibility"] = meeting_type.pop("prompt_visibility", "all")
    meeting_type.pop("type", None)
    return meeting_type


def meeting_type_to_document(meeting_type: Dict[str, Any]) -> Dict[str, Any]:
    document = dict(meeting_type)
    document["type"] = ACTIVE_TEMPLATE_TYPE
    document["category_id"] = document.pop("folder_id", None)
    document["preSessionTalkingPoints"] = document.pop(
        "pre_session_talking_points", []
    )
    document["inSessionTalkingPoints"] = document.pop(
        "in_session_talking_points", []
    )
    document["prompt_visibility"] = document.pop("visibility", "all")
    return document


class PromptRepository:
    """Cosmos adapter for prompt folders and meeting types."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _container(self):
        return self.cosmos.get_container("prompts")

    async def get_inference_catalog(self) -> Optional[Dict[str, Any]]:
        try:
            item = await self._container().read_item(
                item="inference_catalog", partition_key="inference_catalog"
            )
        except CosmosResourceNotFoundError:
            return None
        return item if isinstance(item, dict) else None

    async def save_inference_catalog(
        self, catalog: Dict[str, Any], *, etag: Optional[str]
    ) -> Dict[str, Any]:
        if etag is None:
            return await self._container().create_item(body=catalog)
        return await self._container().replace_item(
            item="inference_catalog",
            body=catalog,
            etag=etag,
            match_condition=MatchConditions.IfNotModified,
        )

    async def count_model_references(self, model_keys: List[str]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for model_key in model_keys:
            iterator = self._container().query_items(
                query=(
                    "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'prompt_subcategory' "
                    "AND c.analysis_model = @model"
                ),
                parameters=[{"name": "@model", "value": model_key}],
            )
            values = [value async for value in iterator]
            counts[model_key] = int(values[0]) if values else 0
        return counts

    async def list_folders(self) -> List[Dict[str, Any]]:
        iterator = self._container().query_items(
            query=f"SELECT * FROM c WHERE c.type = '{ACTIVE_FOLDER_TYPE}'"
        )
        return [folder_from_document(item) async for item in iterator]

    async def create_folder(self, folder: Dict[str, Any]) -> Dict[str, Any]:
        created = await self._container().create_item(body=folder_to_document(folder))
        return folder_from_document(created)

    async def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self._container().read_item(
                item=folder_id, partition_key=folder_id
            )
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict):
            return None
        if item.get("type") != ACTIVE_FOLDER_TYPE:
            return None
        return folder_from_document(item)

    async def save_folder(self, folder: Dict[str, Any]) -> Dict[str, Any]:
        saved = await self._container().upsert_item(body=folder_to_document(folder))
        return folder_from_document(saved)

    async def list_subcategory_ids_by_category(self, category_id: str) -> List[str]:
        query = (
            f"SELECT c.id FROM c WHERE c.type = '{ACTIVE_TEMPLATE_TYPE}' "
            "AND c.category_id = @category_id"
        )
        parameters = [{"name": "@category_id", "value": category_id}]
        iterator = self._container().query_items(query=query, parameters=parameters)
        return [item["id"] async for item in iterator]

    async def list_meeting_types(
        self, folder_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if folder_id:
            query = (
                f"SELECT * FROM c WHERE c.type = '{ACTIVE_TEMPLATE_TYPE}' "
                "AND c.category_id = @category_id"
            )
            parameters = [{"name": "@category_id", "value": folder_id}]
            iterator = self._container().query_items(query=query, parameters=parameters)
        else:
            query = f"SELECT * FROM c WHERE c.type = '{ACTIVE_TEMPLATE_TYPE}'"
            iterator = self._container().query_items(query=query)
        return [meeting_type_from_document(item) async for item in iterator]

    async def create_meeting_type(
        self, meeting_type: Dict[str, Any]
    ) -> Dict[str, Any]:
        created = await self._container().create_item(
            body=meeting_type_to_document(meeting_type)
        )
        return meeting_type_from_document(created)

    async def get_meeting_type(self, meeting_type_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self._container().read_item(
                item=meeting_type_id, partition_key=meeting_type_id
            )
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict):
            return None
        if item.get("type") != ACTIVE_TEMPLATE_TYPE:
            return None
        return meeting_type_from_document(item)

    async def save_meeting_type(
        self, meeting_type: Dict[str, Any]
    ) -> Dict[str, Any]:
        saved = await self._container().upsert_item(
            body=meeting_type_to_document(meeting_type)
        )
        return meeting_type_from_document(saved)

    async def get_folder_reference(self, folder_id: str) -> Optional[Dict[str, Any]]:
        """Read active or deleted folder metadata for historical reporting."""
        try:
            item = await self._container().read_item(
                item=folder_id, partition_key=folder_id
            )
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict) or item.get("type") not in {
            ACTIVE_FOLDER_TYPE,
            DELETED_FOLDER_TYPE,
        }:
            return None
        return folder_from_document(item)

    async def get_meeting_type_reference(
        self, meeting_type_id: str
    ) -> Optional[Dict[str, Any]]:
        """Read active or deleted template metadata for historical reporting."""
        try:
            item = await self._container().read_item(
                item=meeting_type_id, partition_key=meeting_type_id
            )
        except CosmosResourceNotFoundError:
            return None
        if not isinstance(item, dict) or item.get("type") not in {
            ACTIVE_TEMPLATE_TYPE,
            DELETED_TEMPLATE_TYPE,
        }:
            return None
        return meeting_type_from_document(item)

    async def _archive_document(
        self,
        document: Dict[str, Any],
        *,
        deleted_type: str,
        deleted_at: int,
        deleted_by_user_id: Optional[str],
    ) -> None:
        archived = dict(document)
        archived["type"] = deleted_type
        archived["deleted_at"] = deleted_at
        archived["deleted_by_user_id"] = deleted_by_user_id
        kwargs: Dict[str, Any] = {
            "item": archived["id"],
            "body": archived,
        }
        if archived.get("_etag"):
            kwargs.update(
                etag=archived["_etag"],
                match_condition=MatchConditions.IfNotModified,
            )
        await self._container().replace_item(**kwargs)

    async def archive_folder_tree(
        self,
        folder_id: str,
        *,
        deleted_at: int,
        deleted_by_user_id: Optional[str],
    ) -> None:
        """Archive a folder subtree without destroying analytics dimensions.

        Templates are archived first and folders deepest-first. If a write fails,
        a retry can finish the operation without leaving a live child pointing at
        an archived parent.
        """
        folders = [
            item
            async for item in self._container().query_items(
                query=f"SELECT * FROM c WHERE c.type = '{ACTIVE_FOLDER_TYPE}'"
            )
        ]
        folders_by_parent: Dict[str, List[Dict[str, Any]]] = {}
        for folder in folders:
            parent_id = folder.get("parent_category_id")
            if parent_id:
                folders_by_parent.setdefault(str(parent_id), []).append(folder)

        subtree: List[tuple[Dict[str, Any], int]] = []
        pending: List[tuple[str, int]] = [(folder_id, 0)]
        visited: set[str] = set()
        folders_by_id = {str(folder.get("id")): folder for folder in folders}
        while pending:
            current_id, depth = pending.pop()
            if current_id in visited:
                continue
            visited.add(current_id)
            current = folders_by_id.get(current_id)
            if not current:
                continue
            subtree.append((current, depth))
            pending.extend(
                (str(child["id"]), depth + 1)
                for child in folders_by_parent.get(current_id, [])
            )

        folder_ids = {str(folder["id"]) for folder, _ in subtree}
        templates = [
            item
            async for item in self._container().query_items(
                query=f"SELECT * FROM c WHERE c.type = '{ACTIVE_TEMPLATE_TYPE}'"
            )
            if str(item.get("category_id")) in folder_ids
        ]
        for template in templates:
            await self._archive_document(
                template,
                deleted_type=DELETED_TEMPLATE_TYPE,
                deleted_at=deleted_at,
                deleted_by_user_id=deleted_by_user_id,
            )
        for folder, _ in sorted(subtree, key=lambda entry: entry[1], reverse=True):
            await self._archive_document(
                folder,
                deleted_type=DELETED_FOLDER_TYPE,
                deleted_at=deleted_at,
                deleted_by_user_id=deleted_by_user_id,
            )

    async def delete_meeting_type(self, meeting_type_id: str) -> None:
        await self._container().delete_item(
            item=meeting_type_id, partition_key=meeting_type_id
        )
