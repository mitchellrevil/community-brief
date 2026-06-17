# Community Brief Infrastructure

This folder is the Infrastructure-as-Code source of truth for Community Brief.

The infrastructure entrypoint is subscription-scoped:

```powershell
az deployment sub create `
  --name community-dev-infra `
  --location uksouth `
  --template-file infra/main.bicep `
  --parameters infra/main.dev.bicepparam
```

Use `az deployment sub what-if` with the same template and parameter file before the first apply in any environment.

## Deploy App Code

After infrastructure has been deployed and reviewed, ship application artifacts with:

```powershell
./infra/deploy-apps.ps1 `
  -ResourceGroupName rg-dev-community-uksouth
```

For a no-change local check of the resolved commands:

```powershell
./infra/deploy-apps.ps1 -ResourceGroupName rg-dev-community-uksouth -DryRun
```

`deploy-apps.ps1` packages the apps, derives resource names from the canonical resource group name, and deploys code only. It must not write app settings owned by Bicep.

## Parameters And Secrets

Environment files live at:

- `infra/main.dev.bicepparam`
- `infra/main.staging.bicepparam`
- `infra/main.prod.bicepparam`

These files only hold values that differ by environment: environment name, deployment location, CORS origins, AI region, and secret inputs. The stack always deploys the app, Static Web App, AI account, AI project, Speech, Cosmos, Storage, monitoring, Key Vault, and RBAC.

AI model deployments are intentionally hardcoded in `main.bicep` so they are changed once instead of copied across every environment parameter file.

The following values must be supplied by CI or the operator environment before running a deployment:

- `JWT_SECRET_KEY`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_TENANT_ID`

Bicep stores those values as Key Vault secrets and the Web App and Function App consume them through Key Vault references.

## Local Validation

```powershell
az bicep build --file infra/main.bicep
```

The `.bicepparam` files intentionally fail to resolve if the required secret environment variables are absent.

## Supporting Docs

- `infra/app-settings.md` records ownership for runtime and build-time settings.
- `infra/runbooks/migrate-data.md` records the migration and rollback path for Cosmos DB and blob data.
