from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict, Optional

from azure.core import MatchConditions
from azure.cosmos.exceptions import (
    CosmosHttpResponseError,
    CosmosResourceNotFoundError,
)

from ..core.cosmos import CosmosService


ACTIVE_REPROCESS_STATUSES = frozenset(
    {"pending_enqueue", "queued", "running", "retrying"}
)
LOCK_PREFIX = "reprocess-lock:"
MAX_CONCURRENCY_RETRIES = 4


class ReprocessOperationRepository:
    """Persist reprocess operations and one active-operation lock per job."""

    def __init__(self, cosmos_service: CosmosService):
        self.cosmos = cosmos_service

    @property
    def container(self):
        return self.cosmos.get_container("jobs")

    async def get(self, operation_id: str) -> Optional[Dict[str, Any]]:
        try:
            item = await self.container.read_item(
                item=operation_id,
                partition_key=operation_id,
            )
        except CosmosResourceNotFoundError:
            return None
        return item if item.get("type") == "reprocess_operation" else None

    async def create_with_lock(
        self,
        operation: Dict[str, Any],
    ) -> tuple[Dict[str, Any], bool]:
        """Create an operation after atomically acquiring the job's active lock.

        Returns ``(operation, created)``. If another active operation already owns
        the job, that operation is returned and no queue message should be sent.
        """

        existing = await self.get(operation["id"])
        if existing is not None:
            return existing, False

        job_id = str(operation["job_id"])
        lock_id = self._lock_id(job_id)

        for _ in range(MAX_CONCURRENCY_RETRIES):
            lock = {
                "id": lock_id,
                "type": "reprocess_lock",
                "job_id": job_id,
                "operation_id": operation["id"],
                "created_at": datetime.now(UTC).isoformat(),
            }
            try:
                await self.container.create_item(body=lock)
            except CosmosHttpResponseError as exc:
                if exc.status_code != 409:
                    raise
                active = await self._operation_owning_lock(lock_id)
                if active is not None and active.get("status") in ACTIVE_REPROCESS_STATUSES:
                    return active, False
                await self._delete_stale_lock(lock_id)
                continue

            try:
                created = await self.container.create_item(body=operation)
                return created, True
            except CosmosHttpResponseError as exc:
                await self.release_lock(job_id, operation["id"])
                if exc.status_code == 409:
                    existing = await self.get(operation["id"])
                    if existing is not None:
                        return existing, False
                raise

        raise RuntimeError(f"Could not acquire reprocess lock for job {job_id}")

    async def update(
        self,
        operation_id: str,
        updates: Dict[str, Any],
    ) -> Dict[str, Any]:
        for _ in range(MAX_CONCURRENCY_RETRIES):
            operation = await self.get(operation_id)
            if operation is None:
                raise RuntimeError(f"Reprocess operation not found: {operation_id}")
            etag = operation.get("_etag")
            operation.update(updates)
            operation["updated_at"] = datetime.now(UTC).isoformat()
            try:
                concurrency_options = self._concurrency_options(etag)
                return await self.container.replace_item(
                    item=operation_id,
                    body=operation,
                    **concurrency_options,
                )
            except CosmosHttpResponseError as exc:
                if exc.status_code != 412:
                    raise
        raise RuntimeError(
            f"Reprocess operation changed too frequently to update: {operation_id}"
        )

    async def release_lock(self, job_id: str, operation_id: str) -> None:
        lock_id = self._lock_id(job_id)
        try:
            lock = await self.container.read_item(item=lock_id, partition_key=lock_id)
        except CosmosResourceNotFoundError:
            return
        if lock.get("operation_id") != operation_id:
            return
        try:
            concurrency_options = self._concurrency_options(lock.get("_etag"))
            await self.container.delete_item(
                item=lock_id,
                partition_key=lock_id,
                **concurrency_options,
            )
        except CosmosResourceNotFoundError:
            return
        except CosmosHttpResponseError as exc:
            if exc.status_code != 412:
                raise

    async def _operation_owning_lock(
        self,
        lock_id: str,
    ) -> Optional[Dict[str, Any]]:
        try:
            lock = await self.container.read_item(item=lock_id, partition_key=lock_id)
        except CosmosResourceNotFoundError:
            return None
        operation_id = lock.get("operation_id")
        return await self.get(str(operation_id)) if operation_id else None

    async def _delete_stale_lock(self, lock_id: str) -> None:
        try:
            lock = await self.container.read_item(item=lock_id, partition_key=lock_id)
            concurrency_options = self._concurrency_options(lock.get("_etag"))
            await self.container.delete_item(
                item=lock_id,
                partition_key=lock_id,
                **concurrency_options,
            )
        except CosmosResourceNotFoundError:
            return
        except CosmosHttpResponseError as exc:
            if exc.status_code != 412:
                raise

    @staticmethod
    def _lock_id(job_id: str) -> str:
        return f"{LOCK_PREFIX}{job_id}"

    @staticmethod
    def _concurrency_options(etag: Optional[str]) -> Dict[str, Any]:
        if not etag:
            return {}
        return {
            "etag": etag,
            "match_condition": MatchConditions.IfNotModified,
        }
