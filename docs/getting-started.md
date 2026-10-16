# Getting started

[← Back to the README](../README.md)

Run the frontend and API locally and connect them to your Azure resources. The processing worker can run locally or in Azure. Cloud processing requires connectivity.

## Requirements

| Requirement                       | Purpose                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| Git                               | Clone the repository.                                            |
| Node.js 22 and pnpm 11.5.2        | Install and run the frontend using its declared package manager. |
| Python 3.11+                      | Run API and worker in separate virtual environments.             |
| Azure resources                   | Blob Storage, Cosmos DB, Speech, and a supported AI deployment.  |
| Entra ID application registration | Sign users in and acquire an API access token.                   |
| Azure CLI                         | Authenticate locally when using Azure developer credentials.     |
| Functions Core Tools v4           | Run the worker locally.                                          |

Your API and worker identities need access to the configured resources. The examples are configuration starting points; replace placeholders with your own values.

## 1. Clone

```powershell
git clone https://github.com/mitchellrevil/community-brief.git
cd community-brief
```

## 2. Configure identity

Register `http://localhost:3000/auth-redirect.html` as a single-page application redirect URI. Expose the delegated API scope the backend validates and configure the SPA to request it. If using separate SPA and API registrations, grant the SPA access to that API scope.

Configure these values in frontend and backend:

| Setting                | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| `VITE_CLIENT_ID`       | Your configured application client ID.                      |
| `VITE_TENANT_ID`       | Your Entra tenant ID.                                       |
| `VITE_ENTRA_API_SCOPE` | Exposed scope, such as `api://<api-app-id>/access_as_user`. |

Both components must describe the same identity arrangement. Set API `CORS_ORIGINS` to include `http://localhost:3000`. After sign-in, users also need the application role and business-unit membership appropriate to their work.

## 3. Run the API

From the repository root:

```powershell
cd backend_app
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

On macOS/Linux, activate with `source .venv/bin/activate`. Use `python3` if that is how Python 3 is installed.

Edit `backend_app/.env` using the [tracked example](../backend_app/.env.example). Replace identity, database, storage, AI, and worker values; generate a random `JWT_SECRET_KEY` for your environment.

```powershell
# When using local Azure developer credentials:
az login
uvicorn app.main:app --reload --port 8000
```

Check [readiness](http://localhost:8000/health/ready) and [API docs](http://localhost:8000/docs). A running HTTP server alone does not verify every cloud dependency.

## 4. Run the frontend

In another terminal from the repository root:

```powershell
cd frontend_app
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Set `VITE_API_URL=http://localhost:8000` and your identity values in `frontend_app/.env`, then run `pnpm dev`. Open [http://localhost:3000](http://localhost:3000). Restart Vite after changing environment settings. Frontend environment values are visible to the browser; use public configuration only.

## 5. Connect the worker

Follow the [Functions quickstart](../az-func-audio/QUICKSTART.md) to configure runtime storage, Cosmos, Speech, and AI settings in `az-func-audio/local.settings.json`.

In a separate terminal from the repository root:

```powershell
cd az-func-audio
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Create and configure local.settings.json using the worker quickstart.
func start
```

If using `UseDevelopmentStorage=true`, start Azurite first. You may instead connect to a deployed worker through the API's `AZURE_FUNCTIONS_BASE_URL` and any required worker authentication.

| Keep aligned between API and worker                                | Reason                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| Cosmos endpoint, `AZURE_COSMOS_DB`, `AZURE_COSMOS_DB_PREFIX`       | Both must read and update the same application records. |
| Recording storage account and `AZURE_STORAGE_RECORDINGS_CONTAINER` | Uploads must arrive where the worker trigger listens.   |
| AI endpoints, deployment names, and supported API versions         | Requests must match your deployed models.               |

Function host storage and recording storage have distinct configuration responsibilities. Verify the trigger binding against the account receiving uploads.

## 6. Verify a first recording

1. Sign in and confirm access to your assigned service area.
2. Create or select a meeting template using a permitted account.
3. Upload a short, non-sensitive recording.
4. Confirm the worker processes the job.
5. Open the completed file and review its transcript and analysis.

Before offline use, sign in online and let the app and templates load. Keep browser data until drafts and queued recordings upload. Cloud transcription and analysis need connectivity.

Next: [Deployment](deployment.md) · [Troubleshooting](troubleshooting.md)
