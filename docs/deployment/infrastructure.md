# Azure infrastructure

`infra/main.bicep` describes one environment in one resource group. Staging comes first; `sizes.production` already holds the production sizes.

## What it creates

| Resource | Staging | Network |
|---|---|---|
| VNet `10.40.0.0/16` | Subnets `apps` /23, `postgres` /28, `private-endpoints` /27, each with an NSG | — |
| Container Apps environment | Consumption workload profile, managed OpenTelemetry agent → Application Insights | In the `apps` subnet |
| Gateway app | 0.25 vCPU / 0.5 GiB, 0–2 replicas | Public HTTPS |
| One app per service (tenancy, access, catalog, assets, documents) | Same size; every service gets `services__<name>__http__0` for each other service | Internal only, reached as `http://<app name>` |
| `db-bootstrap` and `migrate-<service>` jobs | Manual trigger, image `inventra/db-tools` | In the environment |
| PostgreSQL Flexible Server 17 | Burstable B1ms, 32 GiB, one database per service | Private access, no public endpoint |
| Key Vault | Standard, RBAC, 7-day soft delete | Private endpoint, plus Azure trusted services |
| Storage account (Blob), container `documents` | Standard LRS, no shared keys, no anonymous blobs; only Documents has Storage Blob Data Contributor | The service uses the private endpoint. Browsers download through short-lived user delegation SAS links over the public endpoint, which accepts only Entra tokens and those links. |
| Service Bus | Standard, local (SAS) auth off. Topic `inventra.<service>.events` per service, and a subscription `<subscriber>` per `subscribesTo` entry, all created by Bicep (`Messaging:AutoProvision` is off) | Public, Entra ID only (private endpoints need Premium) |
| Container Registry | Basic, no admin user, no anonymous pull | Public, Entra ID only (private endpoints need Premium) |
| Log Analytics + Application Insights | Pay per GB, 30 days, 1 GB/day cap | — |
| Managed identities | One per app and per job, each with only its own roles | — |
| Static Web Apps (Free) | `admin` and `client`, built by the deploy workflow with `VITE_*` settings baked in; SPA fallback and headers from `infra/web/staticwebapp.config.json` (tested in CI with the emulator) | Public HTTPS (global CDN) |

The services are listed in `infra/services.json`. Bicep, `scripts/build-images.sh`, the jobs and the CI test all read that file. `scripts/check-services-manifest.sh` (CI) fails when it differs from the code: a service project is missing, or `subscribesTo` doesn't match the service's `AddInventraMessaging` call.

## Deployment stages

`scripts/deploy/deploy.sh` deploys the same template three times, in incremental mode:

1. **infra**: everything except jobs and apps. On the first run it also stores newly generated passwords in Key Vault.
2. Build and push the images, tagged with the commit SHA.
3. **jobs**: create or update the database jobs, then run `db-bootstrap` and each `migrate-<service>` and wait for them.
4. **apps**: update the gateway and services to the new tag. Migrations always run before the code that needs them.
5. Smoke test: the gateway's `/alive`.
6. **web**: build each web app whose client ID is set and upload it to its Static Web App, with a deployment token read through ARM for that run only. Sign-in setup is in [identity.md](identity.md).

## Images

* The **gateway and services** are built with `dotnet publish /t:PublishContainer`, so they need no Dockerfile. They use the base `noble-chiseled-extra`: Ubuntu chiseled with no shell, running as a non-root user, with ICU and time zones included. They listen on port 8080.
* **db-tools** (`infra/db/Dockerfile`) contains the ASP.NET runtime, psql, each service's EF Core migrations bundle and the SQL scripts.
* CI builds all of them on every push without pushing anything. It then starts the gateway image and runs the least-privilege test against the service images.

## Check on the first real deployment

Bicep compiles and lints cleanly, and the database scripts are tested against PostgreSQL 17. Azure's behaviour itself can only be confirmed by a first deployment:

* **Key Vault references at deployment time.** `main.bicep` reads secrets from Key Vault with `getSecret()` in the same deployment that creates them on the first run. It sets `dependsOn` so the reads come after the writes.
* **Container Apps reading Key Vault secrets.** The vault allows only its private endpoint and Azure trusted services. If the apps can't read their secrets, allow the Container Apps environment's outbound path, or set `publicNetworkAccess` with an IP rule.
* **Database ownership on Azure.** The bootstrap revokes `CONNECT` from `PUBLIC` on each service database. That works if the admin owns the database, or belongs to `azure_pg_admin`, which owns databases created through ARM.
* **Managed environment API version.** The OpenTelemetry agent settings are only in a preview API version (`2025-02-02-preview`).
