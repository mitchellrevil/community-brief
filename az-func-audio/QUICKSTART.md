# Azure Functions Audio Pipeline — Quickstart

Minimal local quickstart for the Functions audio pipeline (blob-trigger + analysis).

Prereqs
- Python 3.11+ (verify with `python --version`)
- Azure CLI (`az`) — used for login when using Managed Identity
- Azure Functions Core Tools v4 (`func`) — to run functions locally
- Optional: Azurite or Azure Storage Explorer for local blob uploads

Install
1. Open a terminal and change directory:
```bash
cd az-func-audio
```
2. Create and activate a virtual environment:
```bash
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```
3. Install Python dependencies:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Run (local)
1. Create `local.settings.json` (copy or create) with the minimal values below:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AZURE_STORAGE_RECORDINGS_CONTAINER": "recordingscontainer",
    "AZURE_COSMOS_ENDPOINT": "https://<your-cosmos>.documents.azure.com:443/",
    "AZURE_COSMOS_DB": "VoiceDB",
    "AZURE_OPENAI_ENDPOINT": "https://<your-ai-account>.openai.azure.com/",
    "AZURE_OPENAI_DEPLOYMENT": "<deployment-name>",
    "AZURE_OPENAI_API_VERSION": "2025-03-01-preview"
  }
}
```
2. (Optional) Login with Azure if you rely on Managed Identity locally via `az login`.
3. Start the Functions host:
```bash
func start
```

Local vars (essential)
- `AzureWebJobsStorage` — storage connection (or `UseDevelopmentStorage=true` for Azurite)
- `AZURE_STORAGE_RECORDINGS_CONTAINER` — blob container name for uploads
- `AZURE_COSMOS_ENDPOINT` — Cosmos DB endpoint
- `AZURE_COSMOS_DB` — Cosmos DB database name (`VoiceDB` by default)
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` — AI service settings

Quick verification
- Ensure `func start` lists functions (e.g., `blob_trigger`, `ReprocessAnalysis`).
- Upload a test file to the `recordingscontainer` and watch the runtime logs for processing.

Tests
- Run unit tests:
```bash
pytest
```

More details: see `../infra/README.md` for IaC and `../backend_app/README.md` for backend integration.
