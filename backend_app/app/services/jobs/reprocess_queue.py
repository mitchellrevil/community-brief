from __future__ import annotations

import json
from typing import Any, Dict, Optional, Protocol
from urllib.parse import urlparse, urlunparse

from azure.core.exceptions import AzureError
from azure.identity.aio import DefaultAzureCredential
from azure.storage.queue import TextBase64EncodePolicy
from azure.storage.queue.aio import QueueClient

from ...core.config import AppConfig
from ...core.logging import get_logger


logger = get_logger(__name__)
REPROCESS_QUEUE_NAME = "analysis-reprocess"


class ReprocessQueueError(RuntimeError):
    pass


class ReprocessCommandPublisher(Protocol):
    async def publish(self, command: Dict[str, Any]) -> None: ...


def derive_queue_account_url(blob_account_url: str) -> str:
    """Derive an Azure Queue endpoint from a Blob endpoint, including Azurite."""

    parsed = urlparse(blob_account_url)
    hostname = parsed.hostname or ""
    port = parsed.port

    if hostname in {"127.0.0.1", "localhost"} and port == 10000:
        netloc = hostname
        if parsed.username:
            netloc = f"{parsed.username}@{netloc}"
        netloc = f"{netloc}:10001"
        return urlunparse(parsed._replace(netloc=netloc))

    if ".blob." in hostname:
        queue_host = hostname.replace(".blob.", ".queue.", 1)
        netloc = queue_host if port is None else f"{queue_host}:{port}"
        return urlunparse(parsed._replace(netloc=netloc))

    raise ValueError(
        "AZURE_STORAGE_QUEUE_ACCOUNT_URL is required when the blob endpoint "
        "is not an Azure Blob or Azurite endpoint"
    )


class AzureStorageReprocessQueue:
    """Publish durable reprocess commands through one shared Queue client."""

    def __init__(
        self,
        config: AppConfig,
        *,
        queue_client: Optional[QueueClient] = None,
    ) -> None:
        self.config = config
        self._credential: Optional[DefaultAzureCredential] = None
        self._queue_client = queue_client

    def _client(self) -> QueueClient:
        if self._queue_client is not None:
            return self._queue_client

        account_url = self.config.azure_storage_queue_account_url or derive_queue_account_url(
            self.config.azure_storage_account_url
        )
        credential: Any = self.config.azure_storage_key
        if not credential:
            self._credential = DefaultAzureCredential()
            credential = self._credential

        self._queue_client = QueueClient(
            account_url=account_url,
            queue_name=REPROCESS_QUEUE_NAME,
            credential=credential,
            message_encode_policy=TextBase64EncodePolicy(),
        )
        return self._queue_client

    async def publish(self, command: Dict[str, Any]) -> None:
        message = json.dumps(command, separators=(",", ":"), sort_keys=True)
        try:
            await self._client().send_message(message)
        except (AzureError, RuntimeError, ValueError, TypeError, OSError) as exc:
            raise ReprocessQueueError("Failed to enqueue reprocess command") from exc

        logger.info(
            "job_reprocess_command_enqueued",
            operation_id=command.get("operation_id"),
            job_id=command.get("job_id"),
            queue_name=REPROCESS_QUEUE_NAME,
        )

    async def close(self) -> None:
        if self._queue_client is not None:
            await self._queue_client.close()
            self._queue_client = None
        if self._credential is not None:
            await self._credential.close()
            self._credential = None
