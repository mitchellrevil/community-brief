# Backend — Quickstart

Minimal steps to run the Community Brief backend locally.

Prereqs
- Python 3.11+ (verify: `python --version`)
- (Optional) Azure CLI if using Managed Identity locally (`az login`)
- Cosmos DB (Azure or emulator) and access to Storage (Azurite or Azure)

Install
1. Change directory and create a virtual environment:
```bash
cd backend_app
python -m venv .venv
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# macOS/Linux
source .venv/bin/activate
```
2. Install dependencies:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Local vars (minimal)
- Copy the example `.env` and edit the important values:
```powershell
Copy-Item .env.example .env
# then edit backend_app/.env
```
Essential settings (examples):
```
AZURE_COSMOS_ENDPOINT="https://<your-cosmos>.documents.azure.com:443/"
AZURE_COSMOS_DB="VoiceDB"
AZURE_STORAGE_ACCOUNT_URL="https://<yourstorage>.blob.core.windows.net"
AZURE_STORAGE_RECORDINGS_CONTAINER="recordingscontainer"
JWT_SECRET_KEY="replace-with-random"
VITE_CLIENT_ID="<frontend-spa-client-id>"
VITE_TENANT_ID="<tenant-id>"
VITE_ENTRA_API_SCOPE="api://<frontend-spa-client-id>/access_as_user"
ADMIN_PASSWORD_LOGIN_ENABLED="false"
AZURE_OPENAI_ENDPOINT="https://<your-ai-account>.openai.azure.com/"
AZURE_OPENAI_DEPLOYMENT="<deployment-name>"
```

Run
```bash
uvicorn app.main:app --reload --port 8000
```
Verify
- Open `http://localhost:8000/docs` for API docs
- Health: `http://localhost:8000/health/ready`

Tests
```bash
pytest -v
```

Notes
- Ensure `AZURE_STORAGE_RECORDINGS_CONTAINER` and `AZURE_COSMOS_DB` match the values used by `az-func-audio` for end-to-end testing.
