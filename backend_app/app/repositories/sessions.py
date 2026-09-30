from typing import Any, Dict, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError


class SessionRepository:
    """Persistence operations for user session documents."""

    def __init__(self, container: Any):
        self.container = container

    async def upsert_session(self, session: Dict[str, Any]) -> None:
        await self.container.upsert_item(session)

    async def get_session(self, session_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        partition_key = user_id or session_id
        try:
            return await self.container.read_item(item=session_id, partition_key=partition_key)
        except CosmosResourceNotFoundError:
            return await self.find_session_by_id(session_id)

    async def find_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": session_id}]
        query_iter = self.container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True,
        )

        try:
            items = await self._collect_async_items(query_iter)
        except CosmosResourceNotFoundError:
            return None
        return items[0] if items else None

    async def delete_session(self, session_id: str, partition_key: str) -> None:
        await self.container.delete_item(item=session_id, partition_key=partition_key)

    async def find_active_sessions_before(self, stale_before_iso: str) -> list[Dict[str, Any]]:
        query = (
            "SELECT * FROM c WHERE c.type = 'session' AND c.status = 'active' "
            "AND c.last_heartbeat < @stale_time"
        )
        params = [{"name": "@stale_time", "value": stale_before_iso}]
        query_iter = self.container.query_items(
            query=query,
            parameters=params,
            enable_cross_partition_query=True,
        )
        return await self._collect_async_items(query_iter)

    async def _collect_async_items(self, query_iter: Any) -> list[Dict[str, Any]]:
        if not hasattr(query_iter, "__aiter__"):
            query_iter = await query_iter
        return [item async for item in query_iter]
