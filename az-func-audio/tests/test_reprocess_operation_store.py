from copy import deepcopy
from unittest.mock import Mock

from services.reprocess_operation_store import ReprocessOperationStore


class InMemoryContainer:
    def __init__(self, operation: dict) -> None:
        self.items = {operation["id"]: deepcopy(operation)}
        self.replacements = 0

    def read_item(self, *, item: str, partition_key: str) -> dict:
        assert item == partition_key
        return deepcopy(self.items[item])

    def replace_item(self, *, item: str, body: dict, **_options) -> dict:
        self.replacements += 1
        saved = deepcopy(body)
        saved["_etag"] = f'etag-{self.replacements + 1}'
        self.items[item] = saved
        return deepcopy(saved)


def operation(status: str = "queued") -> dict:
    return {
        "id": "operation-1",
        "type": "reprocess_operation",
        "job_id": "job-1",
        "status": status,
        "attempt_count": 0,
        "_etag": "etag-1",
    }


def store_for(operation_document: dict):
    container = InMemoryContainer(operation_document)
    cosmos_service = Mock(jobs_container=container)
    return ReprocessOperationStore(cosmos_service), container


def test_first_delivery_claims_the_operation():
    store, _ = store_for(operation())

    claimed = store.claim("operation-1", dequeue_count=1)

    assert claimed["status"] == "running"
    assert claimed["dequeue_count"] == 1
    assert claimed["attempt_count"] == 1


def test_duplicate_delivery_with_the_same_dequeue_count_is_skipped():
    running = operation(status="running")
    running["dequeue_count"] = 1
    running["attempt_count"] = 1
    store, container = store_for(running)

    claimed = store.claim("operation-1", dequeue_count=1)

    assert claimed is None
    assert container.replacements == 0


def test_redelivery_after_worker_failure_reclaims_the_operation():
    retrying = operation(status="retrying")
    retrying["dequeue_count"] = 1
    retrying["attempt_count"] = 1
    store, _ = store_for(retrying)

    claimed = store.claim("operation-1", dequeue_count=2)

    assert claimed["status"] == "running"
    assert claimed["dequeue_count"] == 2
    assert claimed["attempt_count"] == 2


def test_terminal_operation_is_never_claimed_again():
    store, container = store_for(operation(status="succeeded"))

    claimed = store.claim("operation-1", dequeue_count=2)

    assert claimed is None
    assert container.replacements == 0
