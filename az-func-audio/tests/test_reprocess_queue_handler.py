import json
from unittest.mock import Mock

import pytest

from services.reprocess_queue_handler import ReprocessCommand, ReprocessQueueHandler
from services.reprocess_service import ReprocessResponse


def command() -> ReprocessCommand:
    return ReprocessCommand.from_message_body(
        json.dumps(
            {
                "operation_id": "operation-1",
                "correlation_id": "correlation-1",
                "job_id": "job-1",
            }
        ).encode("utf-8")
    )


def operation_store() -> Mock:
    store = Mock()
    store.claim.return_value = {
        "id": "operation-1",
        "job_id": "job-1",
        "status": "running",
    }
    return store


def test_function_listens_to_the_fixed_reprocess_queue():
    import function_app

    reprocess_function = next(
        function
        for function in function_app.app.get_functions()
        if function.get_function_name() == "ReprocessAnalysisQueue"
    )
    queue_trigger = next(
        binding
        for binding in reprocess_function.get_bindings()
        if binding.type == "queueTrigger"
    )

    assert queue_trigger.queue_name == "analysis-reprocess"


def test_command_validation_happens_at_the_queue_boundary():
    with pytest.raises(ValueError, match="valid JSON"):
        ReprocessCommand.from_message_body(b"not-json")
    with pytest.raises(ValueError, match="operation_id"):
        ReprocessCommand.from_message_body(b'{"job_id":"job-1"}')


def test_success_records_output_and_releases_the_job_lock():
    store = operation_store()
    service = Mock()
    service.reprocess.return_value = ReprocessResponse(
        {"status": "success", "job_id": "output-1", "attempt_number": 3},
        200,
    )
    handler = ReprocessQueueHandler(store, service)

    handler.process(command(), dequeue_count=1)

    store.mark_succeeded.assert_called_once_with(
        "operation-1",
        output_job_id="output-1",
        analysis_attempt_number=3,
    )
    store.release_lock.assert_called_once_with("job-1", "operation-1")


def test_duplicate_delivery_is_skipped_before_analysis():
    store = operation_store()
    store.claim.return_value = None
    service = Mock()
    handler = ReprocessQueueHandler(store, service)

    handler.process(command(), dequeue_count=1)

    service.reprocess.assert_not_called()


def test_transient_failure_is_recorded_and_raised_for_queue_retry():
    store = operation_store()
    service = Mock()
    service.reprocess.return_value = ReprocessResponse(
        {"status": "error", "message": "OpenAI unavailable"},
        500,
    )
    handler = ReprocessQueueHandler(store, service)

    with pytest.raises(RuntimeError, match="OpenAI unavailable"):
        handler.process(command(), dequeue_count=1)

    store.mark_retrying.assert_called_once_with(
        "operation-1",
        "OpenAI unavailable",
    )
    store.release_lock.assert_not_called()


def test_final_failure_is_terminal_and_releases_the_job_lock():
    store = operation_store()
    service = Mock()
    service.reprocess.side_effect = RuntimeError("persistent failure")
    handler = ReprocessQueueHandler(store, service)

    with pytest.raises(RuntimeError, match="persistent failure"):
        handler.process(command(), dequeue_count=5)

    store.mark_failed.assert_called_once_with("operation-1", "persistent failure")
    store.release_lock.assert_called_once_with("job-1", "operation-1")


def test_invalid_job_request_fails_without_retrying():
    store = operation_store()
    service = Mock()
    service.reprocess.return_value = ReprocessResponse(
        {"status": "error", "message": "Job not found"},
        404,
    )
    handler = ReprocessQueueHandler(store, service)

    handler.process(command(), dequeue_count=1)

    store.mark_failed.assert_called_once_with("operation-1", "Job not found")
    store.mark_retrying.assert_not_called()
    store.release_lock.assert_called_once_with("job-1", "operation-1")
