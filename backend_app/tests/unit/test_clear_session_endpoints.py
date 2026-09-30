import pytest
from scripts.clear_session_endpoints import filter_endpoints


def test_filter_endpoints_removes_patterns():
    patterns = ["/api/v1/jobs", "/api/v1/auth/users"]
    endpoints = [
        "/api/v1/auth/users/me/permissions",
        "/api/v1/users/me/business-units",
        "/api/v1/jobs",
        "/api/v1/jobs/12345/reprocess",
        "/home"
    ]

    filtered = filter_endpoints(endpoints, patterns)

    assert "/api/v1/auth/users/me/permissions" not in filtered
    assert "/api/v1/jobs" not in filtered
    assert "/api/v1/jobs/12345/reprocess" not in filtered
    assert "/api/v1/users/me/business-units" in filtered
    assert "/home" in filtered


def test_filter_endpoints_with_regex_patterns():
    # regex prefix 're:' is supported
    patterns = ["re:^/api/v1/auth/users/[^/]+$"]
    endpoints = ["/api/v1/auth/users", "/api/v1/auth/users/me", "/api/v1/auth/users/abcd1234"]
    filtered = filter_endpoints(endpoints, patterns)
    # regex targets only IDs, so first two should remain, last one removed
    assert "/api/v1/auth/users/abcd1234" not in filtered
    assert "/api/v1/auth/users" in filtered
    assert "/api/v1/auth/users/me" in filtered


def test_filter_endpoints_preserves_order_and_dedupes():
    patterns = ["/api/v1/remove"]
    endpoints = ["/a", "/b", "/a", "/keep", "/api/v1/remove/now"]
    filtered = filter_endpoints(endpoints, patterns)
    assert filtered == ["/a", "/b", "/keep"]
