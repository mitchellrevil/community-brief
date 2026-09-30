from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict, Optional

from azure.core import MatchConditions
from azure.cosmos.exceptions import (
    CosmosHttpResponseError,
    CosmosResourceNotFoundError,
)


ACTIVE_STATUSES = frozenset({"pending_enqueue", "queued", "running", "retrying"})
TERMINAL_STATUSES = frozenset({"succeeded", "failed", "enqueue_failed"})
MAX_CONCURRENCY_RETRIES = 4
LOCK_PREFIX = "reprocess-lock:"


class ReprocessOperationStore:
    """Own the queue worker's durable reprocess state transitions."""

    def __init__(self, cosmos_service: Any) -> None:
        self.container = cosmos_service.jobs_container

    def claim(self, operation_id: str, dequeue_count: int) -> Optional[Dict[str, Any]]:
        """Claim work once for this queue delivery.

        A duplicate delivery with the same or lower dequeue count is ignored.
        A later delivery can reclaim an operation left running by a failed worker.
        """

        for _ in range(MAX_CONCURRENCY_RETRIES):
            operation = self._get_required(operation_id)
            status = str(operation.get("status"))

            if status in TERMINAL_STATUSES:
                return None
            if status not in ACTIVE_STATUSES:
                raise RuntimeError(
                    f"Reprocess operation {operation_id} has invalid status {status!r}"
                )

            previous_dequeue_count = int(operation.get("dequeue_count") or 0)
            if status in {"running", "retrying"} and dequeue_count <= previous_dequeue_count:
                return None

            operation.update(
                {
                    "status": "running",
                    "dequeue_count": dequeue_count,
                    "attempt_count": int(operation.get("attempt_count") or 0) + 1,
                    "started_at": datetime.now(UTC).isoformat(),
                    "updated_at": datetime.now(UTC).isoformat(),
                    "error": None,
                }
            )
            replaced = self._replace_if_unchanged(operation)
            if replaced is not None:
                return replaced

        raise RuntimeError(f"Could not claim reprocess operation {operation_id}")

    def mark_retrying(self, operation_id: str, error: str) -> Dict[str, Any]:
        return self._update(
            operation_id,
            {
                "status": "retrying",
                "error": error,
                "last_failed_at": datetime.now(UTC).isoformat(),
            },
        )

    def mark_succeeded(
        self,
        operation_id: str,
        *,
        output_job_id: str,
        analysis_attempt_number: Optional[int],
    ) -> Dict[str, Any]:
        return self._update(
            operation_id,
            {
                "status": "succeeded",
                "output_job_id": output_job_id,
                "analysis_attempt_number": analysis_attempt_number,
                "completed_at": datetime.now(UTC).isoformat(),
                "error": None,
            },
        )

    def mark_failed(self, operation_id: str, error: str) -> Dict[str, Any]:
        return self._update(
            operation_id,
            {
                "status": "failed",
                "error": error,
                "failed_at": datetime.now(UTC).isoformat(),
            },
        )

    def release_lock(self, job_id: str, operation_id: str) -> None:
        lock_id = f"{LOCK_PREFIX}{job_id}"
        try:
            lock = self.container.read_item(item=lock_id, partition_key=lock_id)
        except CosmosResourceNotFoundError:
            return

        if lock.get("operation_id") != operation_id:
            return

        try:
            self.container.delete_item(
                item=lock_id,
                partition_key=lock_id,
                etag=lock.get("_etag"),
                match_condition=MatchConditions.IfNotModified,
            )
        except CosmosResourceNotFoundError:
            return
        except CosmosHttpResponseError as exc:
            if exc.status_code != 412:
                raise

    def _update(self, operation_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        for _ in range(MAX_CONCURRENCY_RETRIES):
            operation = self._get_required(operation_id)
            operation.update(updates)
            operation["updated_at"] = datetime.now(UTC).isoformat()
            replaced = self._replace_if_unchanged(operation)
            if replaced is not None:
                return replaced
        raise RuntimeError(f"Could not update reprocess operation {operation_id}")

    def _get_required(self, operation_id: str) -> Dict[str, Any]:
        try:
            operation = self.container.read_item(
                item=operation_id,
                partition_key=operation_id,
            )
        except CosmosResourceNotFoundError as exc:
            raise RuntimeError(
                f"Reprocess operation not found: {operation_id}"
            ) from exc

        if operation.get("type") != "reprocess_operation":
            raise RuntimeError(f"Item {operation_id} is not a reprocess operation")
        return operation

    def _replace_if_unchanged(
        self,
        operation: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        etag = operation.get("_etag")
        if not etag:
            raise RuntimeError(f"Reprocess operation {operation['id']} has no ETag")
        try:
            return self.container.replace_item(
                item=operation["id"],
                body=operation,
                etag=etag,
                match_condition=MatchConditions.IfNotModified,
            )
        except CosmosHttpResponseError as exc:
            if exc.status_code == 412:
                return None
            raise
