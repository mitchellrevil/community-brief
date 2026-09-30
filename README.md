# Community Brief

Community Brief is a React application with a FastAPI backend and an Azure Functions worker for transcription and AI analysis.

## Repository map

- frontend_app/: React UI, offline recording support, templates, Teams transcript import, and administration.
- backend_app/: authentication, jobs, templates, analytics, and storage APIs.
- az-func-audio/: transcription and analysis worker.
- docs/model-catalog.md: model catalogue and template argument behavior.

## Local development

Use Node.js 22 and pnpm 11.5.2, Python 3.11+, and Azure Functions Core Tools v4 if running the worker locally. Copy each component's example environment file and supply your own Azure resources and identity registration. Keep the Cosmos database and recordings container consistent between the API and worker.

    cd backend_app
    python -m venv .venv
    ./.venv/Scripts/Activate.ps1
    pip install -r requirements.txt
    Copy-Item .env.example .env
    uvicorn app.main:app --reload --port 8000

    cd ../frontend_app
    pnpm install
    Copy-Item .env.example .env
    pnpm dev

The frontend runs at http://localhost:3000. See backend_app/QUICKSTART.md, frontend_app/QUICKSTART.md, and az-func-audio/QUICKSTART.md for component setup.

## Deployment

Provide your own hosting, storage, identity registration, and AI services. Set component environment variables using the example files. This repository does not include infrastructure definitions or environment-specific endpoints. The pipeline builds and validates application packages without deploying them.

## License

See LICENSE.

