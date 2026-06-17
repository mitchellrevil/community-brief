from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from .config import CONFIG, REPO_ROOT


WRITE_METHODS = {"post", "put", "patch", "delete"}
KNOWN_CLEANUP = {
    ("post", "/api/v1/prompts/categories"): "DELETE /api/v1/prompts/categories/{category_id}",
    ("post", "/api/v1/prompts/subcategories"): "DELETE /api/v1/prompts/subcategories/{subcategory_id}",
    ("post", "/api/v1/admin/announcements"): "DELETE /api/v1/admin/announcements/{announcement_id}",
    ("post", "/api/v1/jobs"): "DELETE /api/v1/admin/jobs/{job_id}/permanent when admin writes are enabled",
    ("post", "/api/v1/upload/job"): "DELETE /api/v1/admin/jobs/{job_id}/permanent when admin writes are enabled",
    ("post", "/api/v1/upload/complete"): "DELETE /api/v1/admin/jobs/{job_id}/permanent when admin writes are enabled",
}
HIGH_IMPACT_PATTERNS = (
    "/permission",
    "/password",
    "/bulk-update-users",
    "/assign-user",
    "/restore",
    "/rollback",
    "/reprocess",
    "/share",
)


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    operation_id: str
    tags: tuple[str, ...]
    summary: str
    category: str
    cleanup: str
    parameters: tuple[str, ...]
    request_body: bool


def load_schema(url: str | None = None) -> dict[str, Any]:
    target = url or CONFIG.openapi_url
    response = requests.get(target, timeout=30)
    response.raise_for_status()
    return response.json()


def _classify(method: str, path: str) -> tuple[str, str]:
    key = (method, path)
    if method not in WRITE_METHODS:
        return "read", ""
    if any(pattern in path for pattern in HIGH_IMPACT_PATTERNS):
        return "skipped-high-impact", "No automatic cleanup; route mutates existing user/job permissions or state."
    cleanup = KNOWN_CLEANUP.get(key)
    if cleanup:
        return "write-with-cleanup", cleanup
    return "skipped-no-cleanup", "No matching cleanup route was identified."


def endpoint_map(schema: dict[str, Any]) -> list[Endpoint]:
    endpoints: list[Endpoint] = []
    for path, operations in sorted(schema.get("paths", {}).items()):
        for method, operation in sorted(operations.items()):
            if method.lower() not in {"get", "post", "put", "patch", "delete", "options"}:
                continue
            category, cleanup = _classify(method.lower(), path)
            parameters = tuple(
                parameter.get("name", "")
                for parameter in operation.get("parameters", [])
                if isinstance(parameter, dict)
            )
            endpoints.append(
                Endpoint(
                    method=method.upper(),
                    path=path,
                    operation_id=operation.get("operationId", ""),
                    tags=tuple(operation.get("tags", [])),
                    summary=operation.get("summary", ""),
                    category=category,
                    cleanup=cleanup,
                    parameters=parameters,
                    request_body="requestBody" in operation,
                )
            )
    return endpoints


def write_endpoint_artifacts(schema: dict[str, Any], out_dir: Path | None = None) -> tuple[Path, Path]:
    out = out_dir or REPO_ROOT / "load_tests" / "generated"
    out.mkdir(parents=True, exist_ok=True)
    endpoints = endpoint_map(schema)

    json_path = out / "endpoint-map.json"
    json_path.write_text(
        json.dumps([endpoint.__dict__ for endpoint in endpoints], indent=2, sort_keys=True),
        encoding="utf-8",
    )

    md_path = out / "endpoint-map.md"
    lines = [
        "# Community Brief API Endpoint Map",
        "",
        f"Source: `{CONFIG.openapi_url}`",
        "",
        "| Method | Path | Tags | Category | Parameters | Body | Cleanup |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for endpoint in endpoints:
        lines.append(
            "| {method} | `{path}` | {tags} | {category} | {parameters} | {body} | {cleanup} |".format(
                method=endpoint.method,
                path=endpoint.path,
                tags=", ".join(endpoint.tags) or "-",
                category=endpoint.category,
                parameters=", ".join(endpoint.parameters) or "-",
                body="yes" if endpoint.request_body else "no",
                cleanup=endpoint.cleanup or "-",
            )
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, md_path

