# Deployment

[← Back to the README](../README.md)

Community Brief supplies application code and a validation/package pipeline. Provisioning resources and deploying packages are your responsibility.

## Resource map

| Component      | Hosting option                                     | Dependencies                                                               |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| React frontend | Azure Static Web Apps or equivalent static hosting | API, Microsoft identity, and Blob Storage for direct uploads.              |
| FastAPI        | Azure App Service or compatible Python hosting     | Cosmos, Blob Storage, AI services, and worker.                             |
| Worker         | Azure Functions                                    | Function host storage, recording storage, Cosmos, Speech, and AI services. |
| Data           | Blob Storage and Cosmos DB                         | Application identities with the required data access.                      |
| Identity       | Microsoft Entra ID                                 | SPA redirect URIs and exposed delegated API scope.                         |

## Build and configure

From `frontend_app/`:

```powershell
pnpm install --frozen-lockfile
pnpm run build
```

Publish `frontend_app/dist/` to static hosting. Configure SPA fallback to `index.html` while preserving API routing and the authentication redirect page.

Install each Python component's own requirements in its deployment environment. Serve API `app.main:app` with an ASGI-compatible production server and your host's assigned port. Package and deploy the worker using Azure Functions tooling for the selected plan and Python runtime.

| Boundary       | Configuration                                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Public API URL and Entra values. `VITE_*` settings generally apply at build time. Supported runtime identity/Teams overrides come from `auth-config.js` and `window.__COMMUNITY_BRIEF_CONFIG__`; see [runtime config](../frontend_app/src/config/runtime-config.ts). |
| API            | CORS origins, audience/scope, JWT secret, Cosmos and storage access, AI deployments, and worker URL. Start from the [example environment file](../backend_app/.env.example).                                                                                         |
| Worker         | Python runtime, host storage, blob/queue bindings, matching application data, Speech, and AI access. Use the [worker reference](../az-func-audio/README.md). `local.settings.json` is for local development; deploy settings through Function App configuration.     |
| Identity       | Register your deployed origin's `/auth-redirect.html` SPA URI and grant the required API access.                                                                                                                                                                     |
| Service access | Grant the resource/data-plane permissions required by each configured authentication method. Use managed identities where supported and keep secrets server-side.                                                                                                    |
| Direct uploads | Configure Blob CORS for the frontend origin and upload operations; verify proxy, size, and timeout limits.                                                                                                                                                           |
| Optional Teams | Configure delegated Graph scopes, tenant consent, and the feature flag. See the [frontend reference](../frontend_app/README.md).                                                                                                                                     |

## Rollout checks

1. Verify API readiness and dependency access.
2. Sign in through the deployed frontend and verify authenticated API calls.
3. Check a normal user's role and service-area access.
4. Process a short test recording through transcription and analysis.
5. Test sharing with another permitted account.
6. If using the PWA, verify the new version loads and queued uploads complete.
7. Verify logging, retention enforcement, service usage, and backup/recovery arrangements.

Review AI output and configure participant consent before using real recordings. The UI's retention notice should match retention actually enforced in storage and database configuration.

Retain previous deployment packages and their configuration for recovery. Assess data and template compatibility before rolling back. Database and storage recovery need your own backups and procedure.

Next: [Troubleshooting](troubleshooting.md) · [Architecture](architecture.md)
