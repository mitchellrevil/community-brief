# Contributing to Community Brief

[← Back to the README](README.md)

Contributions to application code, documentation, accessibility, and setup are welcome.

## Workflow

1. Fork and clone the repository, then create a focused branch.
2. Follow [Getting started](docs/getting-started.md) using your own development resources.
3. Update documentation when behaviour or setup changes.
4. Run relevant checks and describe validation in your pull request. Include screenshots for visual changes.

## Checks

From `frontend_app/`:

```powershell
pnpm run type-check
pnpm test
pnpm run build
```

In the backend's virtual environment, from `backend_app/`:

```powershell
python -m pip install -r requirements-test.txt
pytest
```

In the worker's separate environment, from `az-func-audio/`:

```powershell
python -m pip install -r requirements-test.txt
pytest
```

Integration tests may need additional services/configuration; inspect their fixtures before running. Browser tests require test accounts and services; see the [E2E guide](frontend_app/e2e/README.md). Use fictional test content and dedicated development credentials.

## Documentation screenshots

Use the actual app with fictional content, consistent viewports, and no personal data or environment-specific endpoints. The tour uses 1440 × 1000 desktop and 390 × 844 mobile viewports.

Install frontend dependencies and Playwright Chromium. From `frontend_app/`:

```powershell
pnpm exec playwright install chromium
# Use an empty API URL for the fixture-only documentation session.
$env:VITE_API_URL = ''
pnpm exec vite --host 127.0.0.1 --port 3108
```

In a second terminal from `frontend_app/`:

```powershell
node ../scripts/capture-docs.mjs
```

The capture supplies fictional API replies in its own browser context, blocks external requests, and does not modify app authentication or record real audio. Set optional `DOCS_CHROMIUM_PATH` to use an existing Chromium executable.

It generates the individual screenshots and framed `product-tour.png`. Review every image after regeneration. Edit brand artwork in `docs/images/banner.svg`.

## Reports and pull requests

Explain the user problem, affected component, reproduction steps, and expected behaviour. Include sanitised diagnostics. Never commit `.env` files, local settings, access tokens, or real meeting content.

For sensitive security reports, use GitHub private vulnerability reporting if enabled. Avoid publishing credentials or exploit details in public issues.
