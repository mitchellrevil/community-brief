# Troubleshooting and FAQ

[← Back to the README](../README.md)

| Symptom                               | Check                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sign-in or redirect fails             | Match the origin's `/auth-redirect.html` URI to the SPA registration. Verify client, tenant, and scope in both components.    |
| Frontend cannot reach API             | Check `VITE_API_URL`, API availability, CORS, and browser network errors. Restart Vite after environment changes.             |
| API returns 401/403 after sign-in     | Check token audience/scope, application role, business-unit membership, and file/template access.                             |
| No service areas or templates         | Confirm they exist, are visible to the account, and belong to the expected area.                                              |
| Uploaded job does not progress        | Confirm the worker is running and its trigger sees the upload account/container. Compare Cosmos database and prefix settings. |
| Transcription/analysis fails          | Inspect worker logs, service permissions, quotas, deployment names, endpoints, and supported model/API settings.              |
| Local Functions cannot access storage | Start Azurite if using development storage, or configure Azure storage access.                                                |
| Recording cannot start                | Check microphone permission, device availability, and HTTPS or localhost.                                                     |
| Offline templates unavailable         | Sign in and let templates sync online first. Offline data is account-specific.                                                |
| Teams content inaccessible            | Check feature flag, delegated Graph scopes, admin consent, meeting access, and recording-download policy.                     |

## Can I run everything without Azure?

Normal application use depends on Azure storage, database, identity, and AI services. Some development dependencies support emulators; the repository does not supply a complete substitute for the cloud services.

## Does offline mode transcribe on my device?

No. It supports prepared templates, recording drafts, and upload queueing. Transcription and analysis run through the connected API and worker.

## Does the repository provision infrastructure?

No. Provision your own services and follow the [deployment guide](deployment.md). The pipeline packages the application without deploying it.

## Which AI models can I use?

See [model catalogue and template arguments](model-catalog.md). Supported deployments must also be available to your Azure account and environment.

## Are the screenshots from a customer environment?

No. They show the actual frontend with fictional meetings, service areas, and an `example.test` account. The [capture script](../scripts/capture-docs.mjs) intercepts API requests in its own browser session without changing application authentication or connecting to production data.

## How do I report a problem?

Open a [GitHub issue](https://github.com/mitchellrevil/community-brief/issues) with your component, version/commit, reproduction steps, expected and actual behaviour, and sanitised diagnostics. Remove tokens, connection strings, meeting content, and personal information. See [CONTRIBUTING.md](../CONTRIBUTING.md).
