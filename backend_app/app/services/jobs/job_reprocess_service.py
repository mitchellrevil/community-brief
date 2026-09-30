from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, Optional

from azure.core.exceptions import AzureError

from ...core.errors.domain import ApplicationError, ErrorCode
from ...core.logging import get_logger
from ...repositories.reprocess_operations import ReprocessOperationRepository
from .reprocess_queue import ReprocessCommandPublisher, ReprocessQueueError


logger = get_logger(__name__)


@dataclass(frozen=True)
class JobReprocessResult:
    status_code: int
    payload: Dict[str, Any]


class JobReprocessService:
    """Durably submit and inspect analysis reprocess operations."""

    def __init__(
        self,
        operation_repository: ReprocessOperationRepository,
        command_publisher: ReprocessCommandPublisher,
    ) -> None:
        self.operation_repository = operation_repository
        self.command_publisher = command_publisher

    async def reprocess_job_analysis(
        self,
        *,
        job_id: str,
        request_payload: Dict[str, Any],
        job: Dict[str, Any],
        current_user: Dict[str, Any] | str,
        idempotency_key: Optional[str] = None,
    ) -> JobReprocessResult:
        payload = self._build_payload(
            job_id=job_id,
            request_payload=request_payload,
            job=job,
            current_user=current_user,
        )
        user_id = str(payload.get("user_id") or "unknown")
        operation_id = self._operation_id(
            job_id=job_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        now = datetime.now(UTC).isoformat()
        operation = {
            "id": operation_id,
            "type": "reprocess_operation",
            "job_id": job_id,
            "user_id": payload.get("user_id"),
            "user_email": payload.get("user_email"),
            "status": "pending_enqueue",
            "request": payload,
            "idempotency_key_hash": self._hash_key(idempotency_key),
            "attempt_count": 0,
            "created_at": now,
            "updated_at": now,
        }

        operation, was_created = await self.operation_repository.create_with_lock(operation)
        should_publish = was_created or operation.get("status") == "pending_enqueue"
        if not should_publish:
            logger.info(
                "job_reprocess_existing_operation_returned",
                operation_id=operation.get("id"),
                job_id=job_id,
                status=operation.get("status"),
            )
            return self.operation_result(operation)

        command = {
            **operation["request"],
            "operation_id": operation["id"],
            "correlation_id": operation["id"],
        }
        try:
            await self.command_publisher.publish(command)
        except ReprocessQueueError as exc:
            await self._record_enqueue_failure(
                operation_id=str(operation["id"]),
                job_id=job_id,
                error=str(exc),
            )
            raise ApplicationError(
                "Reprocessing could not be queued. Please try again.",
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                status_code=503,
                details={"job_id": job_id, "operation_id": operation_id},
            ) from exc

        try:
            operation = await self.operation_repository.update(
                operation_id,
                {
                    "status": "queued",
                    "queued_at": datetime.now(UTC).isoformat(),
                },
            )
        except (AzureError, RuntimeError, ValueError, TypeError, OSError):
            # The queue send is the durable commit. The worker accepts
            # pending_enqueue and repairs the state when it claims the command.
            logger.exception(
                "job_reprocess_operation_queue_state_update_failed",
                operation_id=operation_id,
                job_id=job_id,
            )
            operation = {**operation, "status": "queued"}

        return self.operation_result(operation)

    async def get_operation(self, operation_id: str) -> Optional[Dict[str, Any]]:
        return await self.operation_repository.get(operation_id)

    @staticmethod
    def operation_result(operation: Dict[str, Any]) -> JobReprocessResult:
        status = str(operation.get("status") or "queued")
        status_code = 200 if status in {"succeeded", "failed", "enqueue_failed"} else 202
        return JobReprocessResult(
            status_code=status_code,
            payload={
                "status": status,
                "message": (
                    "Analysis reprocessing queued"
                    if status in {"pending_enqueue", "queued"}
                    else "Analysis reprocessing operation found"
                ),
                "job_id": operation.get("job_id"),
                "operation_id": operation.get("id"),
                "correlation_id": operation.get("id"),
                "output_job_id": operation.get("output_job_id"),
                "attempt_number": operation.get("analysis_attempt_number"),
                "error": operation.get("error"),
            },
        )

    async def _record_enqueue_failure(
        self,
        *,
        operation_id: str,
        job_id: str,
        error: str,
    ) -> None:
        try:
            await self.operation_repository.update(
                operation_id,
                {
                    "status": "enqueue_failed",
                    "error": error,
                    "failed_at": datetime.now(UTC).isoformat(),
                },
            )
        except (AzureError, RuntimeError, ValueError, TypeError, OSError):
            logger.exception(
                "job_reprocess_enqueue_failure_state_update_failed",
                operation_id=operation_id,
                job_id=job_id,
            )
        try:
            await self.operation_repository.release_lock(job_id, operation_id)
        except (AzureError, RuntimeError, ValueError, TypeError, OSError):
            # Preserve the queue publication error returned to the caller. A
            # stale lock is recoverable by the repository's expiry policy.
            logger.exception(
                "job_reprocess_enqueue_failure_lock_release_failed",
                operation_id=operation_id,
                job_id=job_id,
            )

    @staticmethod
    def _operation_id(
        *,
        job_id: str,
        user_id: str,
        idempotency_key: Optional[str],
    ) -> str:
        if not idempotency_key:
            return str(uuid.uuid4())
        return str(
            uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"community-brief:reprocess:{job_id}:{user_id}:{idempotency_key}",
            )
        )

    @staticmethod
    def _hash_key(idempotency_key: Optional[str]) -> Optional[str]:
        if not idempotency_key:
            return None
        return hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()

    @staticmethod
    def _build_payload(
        *,
        job_id: str,
        request_payload: Dict[str, Any],
        job: Dict[str, Any],
        current_user: Dict[str, Any] | str,
    ) -> Dict[str, Any]:
        payload = dict(request_payload)
        payload["job_id"] = job_id

        user_id = current_user if isinstance(current_user, str) else current_user.get("id")
        user_email: Optional[str] = None
        if isinstance(current_user, dict):
            user_email = current_user.get("email")

        payload["user_id"] = user_id
        if user_email:
            payload["user_email"] = user_email
        payload["displayname"] = job.get("displayname") or job.get("file_name")
        return payload
