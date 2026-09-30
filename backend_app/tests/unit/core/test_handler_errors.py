import pytest
from unittest.mock import MagicMock

from backend_app.app.core.errors.handler import DefaultErrorHandler
from backend_app.app.core.errors.domain import ApplicationError, ErrorCode


def test_raise_internal_logs_and_raises():
    fake_logger = MagicMock()
    handler = DefaultErrorHandler(lambda: fake_logger, base_context={"request_id": "r1"})

    with pytest.raises(ApplicationError) as ctx:
        handler.raise_internal(
            "do the thing",
            ValueError("boom"),
            message="explicit message",
            error_code=ErrorCode.SERVICE_UNAVAILABLE,
            status_code=503,
            context={"attempt": 2},
        )

    exc = ctx.value
    assert exc.message == "explicit message"
    assert exc.status_code == 503
    assert exc.error_code == ErrorCode.SERVICE_UNAVAILABLE
    # Details should include base context and extra fields and action/error_type
    assert exc.details["request_id"] == "r1"
    assert exc.details["attempt"] == 2
    assert exc.details["action"] == "do the thing"
    assert exc.details["error_type"] == "ValueError"

    # Ensure logger.exception was invoked with expected signature
    assert fake_logger.exception.called
    args, kwargs = fake_logger.exception.call_args
    assert args[0] == "internal_action_failed"
    assert kwargs.get("exc_info") is True
    assert kwargs["action"] == "do the thing"
    assert kwargs["request_id"] == "r1"
    assert kwargs["attempt"] == 2
    assert kwargs["error_type"] == "ValueError"
    assert kwargs["error"] == "boom"


def test_raise_internal_default_message():
    fake_logger = MagicMock()
    handler = DefaultErrorHandler(lambda: fake_logger)

    with pytest.raises(ApplicationError) as ctx:
        handler.raise_internal("run job", RuntimeError("bad"))

    exc = ctx.value
    assert exc.message == "Failed to run job"
    assert exc.status_code == 500
    assert exc.error_code == ErrorCode.INTERNAL_ERROR
