# Community Brief

Azure AI Transcription Accelerator: a React SPA that uploads recordings/documents, a FastAPI backend that orchestrates jobs and data access, and an Azure Functions pipeline that performs transcription and AI analysis.

## Repo Map

- `frontend_app/`: React + TanStack Router UI (MSAL sign-in)
- `backend_app/`: FastAPI API (auth, job orchestration, Cosmos/Blob persistence)
- `az-func-audio/`: Azure Functions pipeline (blob-trigger processing + reprocess HTTP endpoint)
- `infra/`: Bicep + app deployment script (`infra/deploy-apps.ps1`)

## Local Development

### Prerequisites

- Node.js 18+ and `pnpm`
- Python 3.11+
- (Optional) Azure Functions Core Tools v4 (`func`) if running the pipeline locally

### 1. Backend API

```powershell
cd backend_app
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2. Azure Functions Pipeline (Optional)

```powershell
cd az-func-audio
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
# Edit local.settings.json (see az-func-audio/QUICKSTART.md)
func start
```

### 3. Frontend

```powershell
cd frontend_app
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Frontend dev server runs on `http://localhost:3000`.

**Important**: `AZURE_STORAGE_RECORDINGS_CONTAINER` and `AZURE_COSMOS_DB` must match between `backend_app` and `az-func-audio` (and your deployed infra), otherwise the blob trigger will not find jobs and status updates will not flow.

## Deploy To Azure (IaC)

The canonical infrastructure entrypoint is `infra/main.bicep`; app code is shipped separately with `infra/deploy-apps.ps1`.

```powershell
# Review infra changes
az deployment sub what-if --location uksouth --template-file infra/main.bicep --parameters infra/main.dev.bicepparam

# Deploy infra, then app artifacts
az deployment sub create --name community-dev-infra --location uksouth --template-file infra/main.bicep --parameters infra/main.dev.bicepparam
./infra/deploy-apps.ps1 -ResourceGroupName rg-dev-community-uksouth
```

More details: `infra/README.md`.

## Documentation Index

- Infrastructure: `infra/README.md`
- Backend API: `backend_app/README.md` and `backend_app/QUICKSTART.md`
- Frontend: `frontend_app/README.md` and `frontend_app/QUICKSTART.md`
- Azure Functions pipeline: `az-func-audio/README.md` and `az-func-audio/QUICKSTART.md`

## License

See `LICENSE`.



