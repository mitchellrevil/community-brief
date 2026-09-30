from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import ceil
from typing import Any, Dict, List, Optional

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from ..core.cosmos import CosmosService


class JobRepository:
    """Cosmos persistence for job records."""

    RETENTION_DAYS = 30

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service
        self._default_ttl: Optional[int] = None
        self._default_ttl_loaded = False

    @property
    def container(self):
        return self.cosmos.get_container("jobs")

    async def get_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self.container.read_item(item=job_id, partition_key=job_id)
            if item.get("type") != "job":
                return None
            return await self._with_effective_ttl(item)
        except CosmosResourceNotFoundError:
            return None

    async def query(self, query: str, parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        query_iterator = self.container.query_items(query=query, parameters=parameters)
        items = [item async for item in query_iterator]
        for item in items:
            if isinstance(item, dict):
                await self._with_effective_ttl(item)
        return items

    async def create(self, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        self._preserve_expiry_deadline(job_doc)
        return await self.container.create_item(body=job_doc)

    async def replace(self, job_id: str, job_doc: Dict[str, Any]) -> Dict[str, Any]:
        self._preserve_expiry_deadline(job_doc)
        return await self.container.replace_item(item=job_id, body=job_doc)

    async def delete(self, job_id: str) -> bool:
        try:
            await self.container.delete_item(item=job_id, partition_key=job_id)
            return True
        except CosmosResourceNotFoundError:
            return False

    async def _get_default_ttl(self) -> Optional[int]:
        if not self._default_ttl_loaded:
            properties = await self.container.read()
            value = properties.get("defaultTtl")
            self._default_ttl = value if isinstance(value, int) else None
            self._default_ttl_loaded = True
        return self._default_ttl

    async def _with_effective_ttl(self, item: Dict[str, Any]) -> Dict[str, Any]:
        if item.get("type") == "job" and not isinstance(item.get("ttl"), int):
            default_ttl = await self._get_default_ttl()
            if default_ttl is not None:
                item["ttl"] = default_ttl
        return item

    def _preserve_expiry_deadline(self, job: Dict[str, Any]) -> None:
        """Keep Cosmos TTL anchored to the recording's original retention deadline."""
        if job.get("type") != "job":
            return

        now = datetime.now(UTC)
        expires_at = self._parse_expiry(job.get("expires_at"))
        if expires_at is None:
            created_at = self._parse_expiry(job.get("created_at"))
            expires_at = (created_at or now) + timedelta(days=self.RETENTION_DAYS)
            job["expires_at"] = expires_at.isoformat()

        job["ttl"] = max(1, ceil((expires_at - now).total_seconds()))

    @staticmethod
    def _parse_expiry(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)
