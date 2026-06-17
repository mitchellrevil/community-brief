# Community Brief Frontend

React single-page app for Community Brief.

If you just want to run it locally, start with `frontend_app/QUICKSTART.md`.

## Quick Start

```powershell
cd frontend_app
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Dev server runs on `http://localhost:3000`.

## Stack

- React 19 + TypeScript + Vite
- TanStack Router (file-based routes) + TanStack Query
- Tailwind CSS + shadcn/ui (Radix primitives)
- MSAL (`@azure/msal-browser`) for Microsoft Entra ID sign-in
- Vitest + React Testing Library, plus Playwright for e2e

## Configuration (Vite Env)

The app reads runtime configuration directly from `import.meta.env`.

- `VITE_API_URL`
    - Local dev: set to the backend base URL, e.g. `http://localhost:8000`
    - Deployed behind Azure Static Web Apps: can be left unset so requests use relative `/api/v1/...` paths
- `VITE_BACKEND_DIRECT_URL`
    - Optional. Used by `directBackendClient` to bypass Azure Static Web Apps upload limits.
- `VITE_CLIENT_ID`, `VITE_TENANT_ID`
    - Required for MSAL sign-in.
- `VITE_ENTRA_API_SCOPE`
    - Required for backend API access tokens.
    - Typical scope: `api://<client-id>/access_as_user`
- `VITE_ENTRA_AUTHORITY`
    - Optional. Defaults to `https://login.microsoftonline.com/<tenant-id>`.
- `VITE_ENABLE_HELP_PAGE`
    - Optional. Set to `true` to show the Help route and navigation entries.
- `VITE_HELP_DOCUMENTATION_URL`, `VITE_SUPPORT_REQUEST_URL`
    - Optional. External links shown on the Help page when configured.

MSAL redirect:

- The app uses `public/auth-redirect.html` and sets `redirectUri` to `window.location.origin + "/auth-redirect.html"`.
- Your Entra app registration must include a SPA redirect URI for your local origin, e.g. `http://localhost:3000/auth-redirect.html`.

## Project Layout

- `src/routes/`: TanStack Router file-based routes
- `src/shared/api/` and feature `data/` modules: API constants, clients, and typed data access
- `src/hooks/`: custom hooks (including job status streaming)
- `src/components/`: reusable UI components (`src/components/ui` contains shadcn/ui)
- `src/lib/`: app infrastructure (offline queueing, auth helpers, utilities)

## Job Status Streaming

Long-running jobs (transcription/analysis) stream status updates.

- Hook: `src/hooks/useJobStatusStream.ts`
- Transport: fetch + manual SSE parsing (not `EventSource`), because `EventSource` is unreliable behind some proxies and cannot attach auth headers.
- Auth: uses `credentials: "include"` and relies on the backend session cookie.

## Testing

```powershell
cd frontend_app
pnpm test
pnpm run type-check
pnpm run test:e2e
```

## See Also

- **Backend API**: [backend_app/README.md](../backend_app/README.md)
- **Azure Functions**: [az-func-audio/README.md](../az-func-audio/README.md)
- **Infrastructure**: [infra/README.md](../infra/README.md)
