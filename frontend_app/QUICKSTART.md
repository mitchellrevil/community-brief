# Frontend — Quickstart

Minimal steps to run the frontend locally.

Prereqs
- Node.js 18+ (verify `node --version`)
- pnpm (install via `npm install -g pnpm`)
- Backend API URL (running locally or accessible) for `VITE_API_URL`

Install
```bash
cd frontend_app
pnpm install
```

Local vars (minimal `.env`)
- Copy `.env.example` to `.env` and set the essential values:
```ini
VITE_API_URL="http://localhost:8000"
VITE_CLIENT_ID="<your-client-id>"
VITE_TENANT_ID="<your-tenant-id>"
VITE_ENTRA_API_SCOPE="api://<your-client-id>/access_as_user"
VITE_ENABLE_HELP_PAGE="false"
```

Run (dev)
```bash
pnpm dev
```
Open: `http://localhost:3000`

Build (prod)
```bash
pnpm build
pnpm serve
```

Tests & checks
```bash
pnpm test        # unit tests (Vitest)
pnpm run type-check
pnpm lint
```

Notes
- The frontend requires the backend API for upload/analysis features. Set `VITE_API_URL` to the backend address.
- MSAL / Entra registration is needed to test authentication locally (see `frontend_app/.env.example`).
