from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.jobs.reprocess_queue import (
    AzureStorageReprocessQueue,
    ReprocessQueueError,
    derive_queue_account_url,
)


def test_queue_url_is_derived_for_azure_storage_and_azurite():
    assert derive_queue_account_url(
        "https://account.blob.core.windows.net"
    ) == "https://account.queue.core.windows.net"
    assert derive_queue_account_url(
        "http://127.0.0.1:10000/devstoreaccount1"
    ) == "http://127.0.0.1:10001/devstoreaccount1"


def test_nonstandard_blob_endpoint_requires_an_explicit_queue_url():
    with pytest.raises(ValueError, match="AZURE_STORAGE_QUEUE_ACCOUNT_URL"):
        derive_queue_account_url("https://storage.example.test")


@pytest.mark.asyncio
async def test_publisher_translates_queue_client_failure_at_the_external_boundary():
    config = MagicMock()
    queue_client = MagicMock()
    queue_client.send_message = AsyncMock(side_effect=OSError("connection lost"))
    publisher = AzureStorageReprocessQueue(config, queue_client=queue_client)

    with pytest.raises(ReprocessQueueError):
        await publisher.publish({"operation_id": "op-1", "job_id": "job-1"})


@pytest.mark.asyncio
async def test_publisher_uses_the_fixed_reprocess_queue():
    config = MagicMock(
        azure_storage_queue_account_url="https://account.queue.core.windows.net",
        azure_storage_key="storage-key",
    )
    queue_client = MagicMock()
    queue_client.send_message = AsyncMock()

    with patch(
        "app.services.jobs.reprocess_queue.QueueClient",
        return_value=queue_client,
    ) as queue_client_factory:
        publisher = AzureStorageReprocessQueue(config)
        await publisher.publish({"operation_id": "op-1", "job_id": "job-1"})

    assert queue_client_factory.call_args.kwargs["queue_name"] == "analysis-reprocess"
