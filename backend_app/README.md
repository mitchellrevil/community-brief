# Community Brief Backend API (FastAPI)

Backend API for Community Brief. It authenticates users, stores job metadata in Cosmos DB, stores artifacts in Blob Storage, and triggers the Azure Functions pipeline.

For local setup, start with `backend_app/QUICKSTART.md`.

## How It Fits

```
Frontend (MSAL) -> Backend API -> Azure Functions (pipeline)
                       |
                       +-> Cosmos DB + Blob Storage
```

## Quick Start

```powershell
cd backend_app
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

## Authentication

The backend accepts an access token in either of these forms:

- `Authorization: Bearer <token>`
- HTTP-only cookie named `access_token`

Core dependencies:

- Standard endpoints: `app/core/auth.py#get_current_user`
- Streaming endpoints: `app/core/auth.py#get_current_user_sse` (Authorization header or cookie only)

Important note about SSE:

- Browser `EventSource` cannot reliably attach custom headers.
- The frontend uses fetch-based streaming (manual SSE parsing) and relies on cookies (`credentials: "include"`).

## Job Lifecycle

Jobs are created by the backend and then updated by the Functions pipeline.

Typical status transitions:

```
uploaded -> transcribing -> transcribed -> analysing -> completed
                                              |
                                              +-> failed
```

## Configuration

Configuration is loaded via `pydantic-settings` in `app/core/config.py`.

- `.env` is loaded from `backend_app/` if present
- Environment variables override `.env`

Shared settings (must match `az-func-audio`):

- `AZURE_STORAGE_RECORDINGS_CONTAINER`
- `AZURE_COSMOS_DB`
- `AZURE_COSMOS_DB_PREFIX`

Auth settings shared with the frontend:

- `VITE_CLIENT_ID`
- `VITE_TENANT_ID`
- `VITE_ENTRA_API_SCOPE`

Backend-only auth setting:

- `ADMIN_PASSWORD_LOGIN_ENABLED`

## Tests

```powershell
cd backend_app
pytest
```

For detailed test coverage and strategy, see `backend_app/tests/`.

## See Also

- **Functions pipeline**: [az-func-audio/README.md](../az-func-audio/README.md)
- **Infrastructure**: [infra/README.md](../infra/README.md)
- **Frontend**: [frontend_app/README.md](../frontend_app/README.md)

