from fastapi_limiter.depends import RateLimiter
from fastapi.testclient import TestClient
from fastapi.routing import APIRoute

from app.main import app


def _iter_api_routes(routes, prefix=""):
    for route in routes:
        if isinstance(route, APIRoute):
            normalized_prefix = prefix if prefix else ""
            yield f"{normalized_prefix}{route.path}", route
            continue

        included_router = getattr(route, "original_router", None)
        nested_routes = getattr(included_router, "routes", None)
        if nested_routes:
            nested_prefix = getattr(included_router, "prefix", "") or getattr(
                getattr(route, "include_context", None), "prefix", ""
            )
            for child_path, child_route in _iter_api_routes(nested_routes, prefix):
                child_inner = (
                    child_path[len(prefix) :] if prefix and child_path.startswith(prefix) else child_path
                )
                if nested_prefix and not child_inner.startswith(nested_prefix):
                    yield f"{prefix}{nested_prefix}{child_inner}", child_route
                else:
                    yield child_path, child_route


def test_openapi_exposes_only_api_v1_and_unversioned_health_routes():
    schema = app.openapi()
    paths = set(schema["paths"])

    assert "/health/live" in paths
    assert "/health/ready" in paths
    assert "/api/v1/jobs" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/folders" in paths
    assert "/api/v1/templates/{template_id}" in paths
    assert "/api/v1/templates/{template_id}/versions" in paths
    assert "/api/v1/templates/{template_id}/versions/compare" in paths
    assert "/api/v1/templates/{template_id}/versions/{version_id}" in paths
    assert "/api/v1/templates/{template_id}/restorations" in paths
    assert "/api/v1/agent-runs" in paths
    assert not any(path.startswith("/api/v1/prompts/") for path in paths)
    for retired_path in (
        "/api/v1/prompt-folders",
        "/api/v1/meeting-types",
        "/api/v1/prompt-agent/stream",
    ):
        assert retired_path not in paths
    assert not any(path.endswith("/versions/{version_id}/restore") for path in paths)
    for path, operations in schema["paths"].items():
        if path.startswith(("/api/v1/folders", "/api/v1/templates")):
            assert all("templates" in operation.get("tags", []) for operation in operations.values())
    assert all(
        "prompt agent" in operation.get("tags", [])
        for operation in schema["paths"]["/api/v1/agent-runs"].values()
    )
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
        "/api/v1/jobs/{job_id}/reprocess/{operation_id}",
        "/api/v1/admin/jobs/{job_id}/reprocess-blob",
        "/api/v1/admin/announcements",
    }

    routes_by_path = {
        f"{path}{('/' if path else '')}".rstrip("/"): route
        for path, route in _iter_api_routes(app.router.routes)
        if hasattr(route, "dependant")
    }

    missing = []
    for path in expected_limited_paths:
        route = routes_by_path.get(path.rstrip("/"))
        if route is None:
            missing.append(path)
            continue

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


def test_linked_backend_health_aliases_are_available_but_hidden_from_openapi():
    client = TestClient(app)

    assert client.get("/api/health/live").json() == {"status": "ok"}
    assert client.get("/api/health/ready").json()["status"] in {"ok", "degraded"}
    assert "/api/health/live" not in app.openapi()["paths"]
    assert "/api/health/ready" not in app.openapi()["paths"]
