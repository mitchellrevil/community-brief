# E2E (Playwright)

This folder contains Playwright end-to-end tests.

## How auth works

Tests use cookie-based sessions from the FastAPI backend.

- `e2e/global-setup.ts` logs in once per role via the `loginPath` configured in `e2e/utils/config.ts`
- It writes Playwright storage state files:
  - `e2e/storageState.anon.json`
  - `e2e/storageState.user.json`
  - `e2e/storageState.editor.json`
  - `e2e/storageState.admin.json`

These files contain cookies for the backend origin and optional localStorage hints for the frontend origin.

## Required environment variables

By default, provide credentials via env vars:

- `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`
- `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`

Optional:
- `E2E_FRONTEND_URL` (default `http://localhost:3000`)
- `E2E_BACKEND_URL` (default `http://localhost:8000`)

## Local-only convenience: passwords file

If you have a local file with `email,password` lines (for example `.env.passwords` in repo root), you can opt in:

- `E2E_USE_PASSWORDS_FILE=1`
- `E2E_PASSWORDS_FILE=.env.passwords` (optional; defaults to `.env.passwords`)

The setup infers roles from email local-parts (`admin@...`, `editor@...`, otherwise `user`).

## Running

Start the backend and frontend, then run:

- `pnpm exec playwright test`

If you hit HTTP 429 during setup, start the backend with `DISABLE_LOGIN_RATE_LIMITER=1` for E2E runs.
