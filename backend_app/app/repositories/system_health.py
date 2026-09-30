from __future__ import annotations

import inspect
from typing import Any, Dict, List

from ..core.cosmos import CosmosService


class SystemHealthRepository:
    """Persistence probes used by system health monitoring."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    def _auth_container(self):
        return self.cosmos.get_container("auth")

    async def probe_auth_container(self) -> List[Dict[str, Any]]:
        container = self._auth_container()
        if not container:
            return []

        query_iterator = container.query_items(query="SELECT TOP 1 c.id FROM c")
        if inspect.isawaitable(query_iterator):
            query_iterator = await query_iterator

        if hasattr(query_iterator, "__aiter__"):
            return [item async for item in query_iterator]
        if hasattr(query_iterator, "__iter__"):
            return [item for item in query_iterator]
        return list(query_iterator)
