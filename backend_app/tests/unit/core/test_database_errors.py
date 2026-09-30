import pytest

from backend_app.app.core.errors.database import (
    ConnectionError,
    AuthenticationError,
    QueryError,
    DocumentNotFoundError,
    ConflictError,
    PermissionDeniedError,
    ContainerNotFoundError,
    ThrottlingError,
    TimeoutError,
)
from backend_app.app.core.errors.domain import ErrorCode


def test_connection_error_contains_endpoint_and_status():
    exc = ConnectionError(endpoint="https://db.local", details={"x": 1})
    assert "Cannot connect" in str(exc)
    assert exc.status_code == 503
    assert exc.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
    assert exc.details.get("endpoint") == "https://db.local"


def test_authentication_error_sets_unauthorized():
    exc = AuthenticationError(reason="bad token")
    assert exc.status_code == 401
    assert exc.error_code == ErrorCode.UNAUTHORIZED


def test_query_error_truncates_long_query():
    long_q = "SELECT * FROM c WHERE " + ("a" * 400)
    exc = QueryError(query=long_q, container="jobs", reason="syntax")
    assert exc.status_code == 500
    assert exc.details["container"] == "jobs"
    assert exc.details["query"].endswith("...")


def test_document_not_found_error_populates_details():
    exc = DocumentNotFoundError(document_id="doc1", container="c1")
    assert exc.status_code == 404
    assert exc.error_code == ErrorCode.RESOURCE_NOT_FOUND
    assert exc.details["document_id"] == "doc1"


def test_conflict_error_includes_document():
    exc = ConflictError(reason="duplicate", document_id="doc2")
    assert exc.status_code == 409
    assert exc.error_code == ErrorCode.RESOURCE_CONFLICT
    assert exc.details["document_id"] == "doc2"


def test_permission_denied_error_sets_forbidden():
    exc = PermissionDeniedError(resource="container_x", operation="read")
    assert exc.status_code == 403
    assert exc.error_code == ErrorCode.FORBIDDEN


def test_container_not_found_error_uses_resource_not_found():
    exc = ContainerNotFoundError(container_name="mycontainer", database="db1")
    assert exc.status_code == 404
    assert exc.error_code == ErrorCode.RESOURCE_NOT_FOUND


def test_throttling_and_timeout_have_expected_codes():
    t = ThrottlingError(retry_after_ms=120)
    assert t.status_code == 429
    assert t.error_code == ErrorCode.QUOTA_EXCEEDED

    to = TimeoutError(operation="read", timeout_seconds=2.5)
    assert to.status_code == 504
    assert to.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
