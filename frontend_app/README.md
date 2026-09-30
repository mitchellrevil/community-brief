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
- `VITE_CLIENT_ID`, `VITE_TENANT_ID`, `VITE_ENTRA_API_SCOPE`
    - Required for MSAL sign-in and backend API token acquisition.
- `VITE_ENABLE_TEAMS_RECORDINGS`
    - Defaults to disabled. Set to `true` in `.env.local` to enable the **Community Brief files** and **Teams meetings** source checkboxes to the left of Refresh/Cards/Table on My Files.
    - Deployments can set `features.teamsRecordings` in `auth-config.js` to override the build setting. An unset value leaves the build setting in effect.
    - Community Brief files default to checked and Teams meetings to unchecked. Both choices are saved in browser local storage. Uncheck Community Brief files to show only Teams. Teams data is requested only while the flag and Teams checkbox are enabled.
    - Both sources use the existing recording cards/list, search/date filters, and one paginated list sorted newest first by creation time. Teams metadata uses the calendar event's created/updated timestamps (falling back to the meeting date when creation time is unavailable), organiser, meeting date, and scheduled duration. Choose All Statuses to include meetings awaiting processing.

Teams transcript import also requires delegated Microsoft Graph permissions
`Calendars.ReadBasic`, `OnlineMeetings.Read`,
`OnlineMeetingTranscript.Read.All`, and `OnlineMeetingRecording.Read.All`.
A tenant administrator must grant consent for transcript and recording access.
The recording scope is requested separately so transcript import remains available
when recording consent has not yet been granted.
My Files shows meetings with a transcript or recording, imports the transcript
first, and uses the recording when no usable transcript is available. Invited
attendees can import transcripts when Graph permits access. Recording downloads
for attendees also depend on the tenant's Teams recording download policy.
When a meeting transcript is inaccessible, Request access opens an email draft
addressed to the meeting organiser; the user sends it from their own email app.

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
