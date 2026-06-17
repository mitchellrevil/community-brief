from __future__ import annotations

from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


class AnnouncementRepository:
    """Cosmos persistence for announcement records."""

    CONTAINER_NAME = "announcements"

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container(self.CONTAINER_NAME)

    async def create(self, document: Dict[str, Any]) -> Dict[str, Any]:
        return await self.container.create_item(body=document)

    async def get_by_id(self, announcement_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self.container.read_item(
                item=announcement_id,
                partition_key=announcement_id,
            )
        except CosmosResourceNotFoundError:
            return None

    async def update(self, announcement_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        existing = await self.get_by_id(announcement_id)
        if existing is None:
            return None

        updated_doc = {**existing, **updates}
        return await self.container.upsert_item(body=updated_doc)

    async def delete(self, announcement_id: str) -> bool:
        try:
            await self.container.delete_item(
                item=announcement_id,
                partition_key=announcement_id,
            )
            return True
        except CosmosResourceNotFoundError:
            return False

    async def list(
        self,
        *,
        limit: int,
        offset: int,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        where_clause, filter_parameters = self._build_filter_clause(filters)
        item_parameters = filter_parameters + [
            {"name": "@offset", "value": offset},
            {"name": "@limit", "value": limit},
        ]

        items_query = (
            f"SELECT * FROM c WHERE {where_clause} "
            "ORDER BY c.created_at DESC OFFSET @offset LIMIT @limit"
        )
        items = [
            item
            async for item in self.container.query_items(
                query=items_query,
                parameters=item_parameters,
            )
        ]

        count_query = f"SELECT VALUE COUNT(1) FROM c WHERE {where_clause}"
        count_results = [
            count
            async for count in self.container.query_items(
                query=count_query,
                parameters=filter_parameters or None,
            )
        ]
        total = count_results[0] if count_results else 0

        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    async def get_active_for_user(
        self,
        *,
        now_ms: int,
        user_role: str,
        user_id: Optional[str],
        user_email: Optional[str],
        user_service_areas: List[str],
    ) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM c
            WHERE c.type = 'announcement'
              AND c.is_active = true
              AND (NOT IS_DEFINED(c.start_at) OR c.start_at = null OR c.start_at <= @now)
              AND (NOT IS_DEFINED(c.end_at) OR c.end_at = null OR c.end_at > @now)
              AND (
                    (IS_DEFINED(c.target_user_ids) AND ARRAY_CONTAINS(c.target_user_ids, @user_id))
                    OR (IS_DEFINED(c.target_user_emails) AND ARRAY_CONTAINS(c.target_user_emails, @user_email))
                    OR (
                        (NOT IS_DEFINED(c.target_user_ids) OR ARRAY_LENGTH(c.target_user_ids) = 0)
                        AND (NOT IS_DEFINED(c.target_user_emails) OR ARRAY_LENGTH(c.target_user_emails) = 0)
                        AND (NOT IS_DEFINED(c.target_roles) OR ARRAY_LENGTH(c.target_roles) = 0 OR ARRAY_CONTAINS(c.target_roles, @user_role))
                        AND (
                            NOT IS_DEFINED(c.target_service_areas)
                            OR ARRAY_LENGTH(c.target_service_areas) = 0
                            OR EXISTS(
                                SELECT VALUE area
                                FROM area IN c.target_service_areas
                                WHERE ARRAY_CONTAINS(@user_service_areas, area)
                            )
                        )
                    )
                  )
            ORDER BY c.created_at DESC
        """
        parameters = [
            {"name": "@now", "value": now_ms},
            {"name": "@user_role", "value": user_role},
            {"name": "@user_id", "value": user_id},
            {"name": "@user_email", "value": user_email},
            {"name": "@user_service_areas", "value": user_service_areas},
        ]

        return [
            item
            async for item in self.container.query_items(
                query=query,
                parameters=parameters,
            )
        ]

    def _build_filter_clause(self, filters: Optional[Dict[str, Any]]) -> tuple[str, List[Dict[str, Any]]]:
        where_clauses = ["c.type = 'announcement'"]
        parameters: List[Dict[str, Any]] = []

        if filters:
            for key, value in filters.items():
                param_name = f"@{key}"
                where_clauses.append(f"c.{key} = {param_name}")
                parameters.append({"name": param_name, "value": value})

        return " AND ".join(where_clauses), parameters
