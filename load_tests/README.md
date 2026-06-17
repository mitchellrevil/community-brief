# Community Brief Locust Load Tests

This is a cleanup-aware Locust framework for the Community Brief API. It reads auth from `scripts/.env` when that file contains a raw bearer/JWT token, or from these environment variables when you prefer explicit config:

- `COMMUNITY_AUTH_TOKEN` or `LOAD_TEST_AUTH_TOKEN`
- `COMMUNITY_AUTH_EMAIL` and `COMMUNITY_AUTH_PASSWORD`
- `COMMUNITY_API_HOST`
- `COMMUNITY_OPENAPI_URL`

The default host is:

```powershell
http://localhost:8000
```

`frontend_app/.env` is loaded for reusable credentials only; `VITE_API_URL` does not override the load-test target. Set `COMMUNITY_API_HOST` when you intentionally want to load test a different API.

## Install

```powershell
py -m pip install -r load_tests/requirements.txt
```

## Live Web UI

```powershell
.\load_tests\run-ui.ps1
```

Then open:

```powershell
http://localhost:8089
```

Use the UI to set users, spawn rate, and run time. Locust shows live request charts, failures, response percentiles, and lets you download reports from the browser.

## Read-Only CLI Run

Use this only when you want a quick terminal/CI run:

```powershell
py -m locust -f load_tests/locustfile.py --headless -u 5 -r 1 -t 1m --csv load_tests/results/read-smoke
```

## Cleanup-Aware Write UI

Writes are enabled by default. Set `COMMUNITY_ENABLE_WRITES=false` if you want a read-only run.

```powershell
$env:COMMUNITY_ENABLE_WRITES = "true"
$env:COMMUNITY_ENABLE_ADMIN_WRITES = "true"
$env:COMMUNITY_ALLOWED_WRITE_FLOWS = "prompts,announcements,jobs,upload"
.\load_tests\run-ui.ps1
```

The write user exercises the cleanup-safe write surface across the app:

- `POST /api/v1/prompts/categories` then `DELETE /api/v1/prompts/categories/{id}`
- `POST /api/v1/prompts/subcategories` then `DELETE /api/v1/prompts/subcategories/{id}`
- `POST /api/v1/jobs` then `DELETE /api/v1/admin/jobs/{id}/permanent`
- `POST /api/v1/upload/job` then `DELETE /api/v1/admin/jobs/{id}/permanent`
- `POST /api/v1/admin/announcements` then `DELETE /api/v1/admin/announcements/{id}` when the user is allowed

High-impact writes such as permission changes, password changes, sharing, rollback, restore, reprocess, and business-unit assignment are mapped but skipped by default.

## Endpoint Map

The OpenAPI endpoint map is refreshed automatically on Locust startup. You can refresh it directly:

```powershell
$env:PYTHONPATH = "load_tests"
py load_tests/tools/refresh_endpoint_map.py
```

Generated files:

- `load_tests/generated/endpoint-map.md`
- `load_tests/generated/endpoint-map.json`
