# Architecture

[← Back to the README](../README.md)

Community Brief separates the interactive workspace, API, and asynchronous worker. Upload requests do not need to remain open while transcription and analysis finish.

## Service boundaries

| Service              | Responsibility                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| React frontend / PWA | Recording, uploads, templates, file browsing, results, and administration. MSAL handles Microsoft sign-in.    |
| FastAPI              | Access validation, jobs, uploads, templates, sharing, and application data.                                   |
| Blob Storage         | Uploaded files, transcripts, and analysis artifacts.                                                          |
| Azure Functions      | Blob-triggered processing and analysis reprocessing.                                                          |
| Azure AI Speech      | Audio transcription through the configured service.                                                           |
| Azure OpenAI         | Analysis using configured deployments and template instructions. See the [model catalogue](model-catalog.md). |
| Cosmos DB            | Job metadata, templates, users, and application state.                                                        |

## Processing lifecycle

1. The user selects a service area and template, then records or uploads content.
2. The API creates the job and stores the upload. Direct Blob upload is available where configured.
3. The worker processes the recording and stores transcription output.
4. The worker applies the selected analysis workflow and template.
5. Status and results are persisted and retrieved by the frontend.

Typical audio job states:

```text
uploaded → transcribing → transcribed → analysing → completed
```

Failures can occur at multiple stages; inspect the job and worker logs before reprocessing. Documents and imported Teams transcripts may enter processing with existing text instead of following the audio transcription step.

## Identity and access

The API validates the configured Entra token audience and delegated scope. Application roles, business-unit membership, and per-file sharing govern workspace access. The frontend uses fetch-based job-status streaming to support authenticated requests. See the [API reference](../backend_app/README.md).

## Offline boundary

The PWA can retain the application shell, account-specific templates, local drafts, and queued recordings. Users must establish their session and prepare templates online first. Clearing browser storage can remove unsubmitted recordings.

Cloud transcription, analysis, Teams access, and server-side sharing require connectivity.

## Source map

| Location                     | Contains                                                 |
| ---------------------------- | -------------------------------------------------------- |
| `frontend_app/src/features/` | Feature screens, hooks, and API access.                  |
| `frontend_app/src/routes/`   | TanStack Router routes.                                  |
| `frontend_app/src/shared/`   | Shared contracts and data access.                        |
| `backend_app/app/`           | API routes, configuration, authentication, and services. |
| `az-func-audio/`             | Function entrypoints and processing implementation.      |

Next: [Deployment](deployment.md) · [Model catalogue](model-catalog.md)
