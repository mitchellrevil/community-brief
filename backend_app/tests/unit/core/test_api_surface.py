from fastapi_limiter.depends import RateLimiter
from fastapi.testclient import TestClient

from app.main import app


def test_openapi_exposes_only_api_v1_and_unversioned_health_routes():
    paths = set(app.openapi()["paths"])

    assert "/health/live" in paths
    assert "/health/ready" in paths
    assert "/api/v1/jobs" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/prompts/subcategories/{subcategory_id}" in paths
    assert "/api/v1/subcategories/{subcategory_id}" not in paths
    assert "/api/v1/stream/jobs/{job_id}/status" in paths
    assert "/api/v1/jobs/{job_id}/status-stream" not in paths
    assert "/health" not in paths
    assert "/api/jobs" not in paths
    assert "/api/health" not in paths
    assert "/api/system/health" not in paths
    assert all(path.startswith("/api/v1/") or path in {"/health/live", "/health/ready"} for path in paths)


def test_sensitive_route_groups_have_fastapi_limiter_dependency():
    expected_limited_paths = {
        "/api/v1/auth/login",
        "/api/v1/upload/request-token",
        "/api/v1/jobs/{job_id}/chat/stream",
        "/api/v1/stream/jobs/{job_id}/status",
        "/api/v1/jobs/{job_id}/reprocess",
        "/api/v1/admin/jobs/{job_id}/reprocess-blob",
        "/api/v1/admin/announcements",
    }

    routes_by_path = {route.path: route for route in app.routes if hasattr(route, "dependant")}

    missing = []
    for path in expected_limited_paths:
        route = routes_by_path[path]
        if not any(isinstance(dependency.call, RateLimiter) for dependency in route.dependant.dependencies):
            missing.append(path)

    assert missing == []


def test_swagger_docs_csp_allows_fastapi_swagger_ui_bootstrap():
    response = TestClient(app).get("/docs")

    assert response.status_code == 200
    csp = response.headers["Content-Security-Policy"]
    assert "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net" in csp
    assert "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net" in csp


def test_default_csp_keeps_inline_scripts_blocked_outside_docs():
    response = TestClient(app).get("/health/live")

    assert response.status_code == 200
    csp = response.headers["Content-Security-Policy"]
    assert "script-src 'self';" in csp
    assert "'unsafe-inline' https://cdn.jsdelivr.net" not in csp
