from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict

from core.logging import get_logger
from services.reprocess_operation_store import ReprocessOperationStore
from services.reprocess_service import ReprocessService


logger = get_logger(__name__)
MAX_DEQUEUE_COUNT = 5


@dataclass(frozen=True)
class ReprocessCommand:
    operation_id: str
    correlation_id: str
    payload: Dict[str, Any]

    @classmethod
    def from_message_body(cls, message_body: bytes) -> "ReprocessCommand":
        try:
            payload = json.loads(message_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Reprocess queue message must contain valid JSON") from exc

        if not isinstance(payload, dict):
            raise ValueError("Reprocess queue message must be a JSON object")

        operation_id = payload.get("operation_id")
        job_id = payload.get("job_id")
        if not isinstance(operation_id, str) or not operation_id:
            raise ValueError("Reprocess queue message requires operation_id")
        if not isinstance(job_id, str) or not job_id:
            raise ValueError("Reprocess queue message requires job_id")

        correlation_id = payload.get("correlation_id") or operation_id
        if not isinstance(correlation_id, str):
            raise ValueError("Reprocess queue message correlation_id must be a string")

        return cls(
            operation_id=operation_id,
            correlation_id=correlation_id,
            payload=payload,
        )


class ReprocessQueueHandler:
    """Run one claimed reprocess command and record its durable outcome."""

    def __init__(
        self,
        operation_store: ReprocessOperationStore,
        reprocess_service: ReprocessService,
    ) -> None:
        self.operation_store = operation_store
        self.reprocess_service = reprocess_service

    def process(self, command: ReprocessCommand, *, dequeue_count: int) -> None:
        operation = self.operation_store.claim(command.operation_id, dequeue_count)
        if operation is None:
            logger.info(
                "reprocess_queue.duplicate_skipped",
                operation_id=command.operation_id,
                dequeue_count=dequeue_count,
            )
            return

        try:
            response = self.reprocess_service.reprocess(
                command.payload,
                correlation_id=command.correlation_id,
                operation_id=command.operation_id,
            )
        except Exception as exc:
            self._record_retry_or_failure(
                command,
                dequeue_count=dequeue_count,
                error=str(exc),
            )
            raise

        if response.status_code >= 500:
            error = str(response.payload.get("message") or "Reprocessing failed")
            self._record_retry_or_failure(
                command,
                dequeue_count=dequeue_count,
                error=error,
            )
            raise RuntimeError(error)

        if response.status_code >= 400:
            error = str(response.payload.get("message") or "Reprocessing rejected")
            self.operation_store.mark_failed(command.operation_id, error)
            self.operation_store.release_lock(
                str(operation["job_id"]),
                command.operation_id,
            )
            return

        self.operation_store.mark_succeeded(
            command.operation_id,
            output_job_id=str(response.payload["job_id"]),
            analysis_attempt_number=response.payload.get("attempt_number"),
        )
        self.operation_store.release_lock(
            str(operation["job_id"]),
            command.operation_id,
        )
        logger.info(
            "reprocess_queue.completed",
            operation_id=command.operation_id,
            job_id=operation["job_id"],
            output_job_id=response.payload["job_id"],
            dequeue_count=dequeue_count,
        )

    def _record_retry_or_failure(
        self,
        command: ReprocessCommand,
        *,
        dequeue_count: int,
        error: str,
    ) -> None:
        if dequeue_count < MAX_DEQUEUE_COUNT:
            self.operation_store.mark_retrying(command.operation_id, error)
            logger.warning(
                "reprocess_queue.retry_scheduled",
                operation_id=command.operation_id,
                dequeue_count=dequeue_count,
                error=error,
            )
            return

        self.operation_store.mark_failed(command.operation_id, error)
        self.operation_store.release_lock(
            str(command.payload["job_id"]),
            command.operation_id,
        )
        logger.error(
            "reprocess_queue.failed",
            operation_id=command.operation_id,
            dequeue_count=dequeue_count,
            error=error,
        )
