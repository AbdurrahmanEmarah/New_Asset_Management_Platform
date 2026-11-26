# CLAUDE.md: Inventra

Project memory for Claude Code sessions. Keep it current: update it in the same patch whenever a decision or convention changes.

## The product

Inventra is a multi-tenant asset management SaaS. Each client company manages its own kinds of assets, and the asset types are configuration, not code. The owner of this repo is the **Platform Owner**. Clients manage their own users, roles and assets. See `docs/account-model.md`.

- **Plan:** `docs/architecture.md`, with diagrams in `docs/system-map.html`.
- **Design canvas:** https://claude.ai/artifact/YX1kqgRvtMLYaUSuvnidDe
- **Living system map:** https://claude.ai/artifact/2nRZJcGkZpsySf9NCuZpyV. Update it, and `docs/system-map.html`, at every step: status, diagrams, things to be aware of, change log.

## Stack

| Area | Choice |
|---|---|
| Runtime | .NET 10 (LTS). `global.json` pins 10.0.100 and rolls forward to newer feature bands. |
| Local orchestration | Aspire 13.6.5 AppHost: `src/AppHost/Inventra.AppHost`. |
| Shared chassis | `src/BuildingBlocks/Inventra.BuildingBlocks`: service defaults (OpenTelemetry, health, service discovery, resilience), sign-in and policies, database setup, problem details. |
| Gateway | YARP, `src/Gateway/Inventra.Gateway`. Routes are `/api/<service>/**`; every route requires a token. |
| Data | PostgreSQL, one database per service, EF Core 10 + Npgsql, snake_case names, pool capped by `Database:MaxPoolSize` (default 10). |
| Identity | Keycloak locally (port **18080**). Realms are `inventra-platform` (staff; client `admin-console`) and `inventra` (clients; public clients `web-app` and `field-app`, confidential client `access-service`). The `tenant_id` claim comes from a user attribute. Entra External ID in Azure. |
| Messaging | Wolverine with a PostgreSQL outbox/inbox (schema `wolverine`), in `src/BuildingBlocks/Inventra.BuildingBlocks.Messaging`. Event contracts are in `Inventra.Contracts`. Transport: Azure Service Bus when `ServiceBus:FullyQualifiedNamespace` is set, RabbitMQ when `ConnectionStrings:rabbitmq` is set, local queues in tests. |
| Web | `web/`: one npm package with apps under `web/apps/*` (`admin` on 5173, `client` on 5174) and shared code in `web/shared`. React 19, React Router 7, Vite 7, TypeScript 5.9, Vitest 4.0, ESLint 9. |
| Packages | Central package management in `Directory.Packages.props`. NuGet audit fails the build on advisories. |

## Services

| Service | Status |
|---|---|
| Tenancy & Admin (`src/Services/Tenancy`) | Built: clients, plans, limits, platform audit. |
| Access (`src/Services/Access`, port 5202, `accessdb`) | Built (milestone 02): users, invitations, roles and permissions, site scope on role assignments, sites, support passes, client audit, row-level security. See `docs/access.md`. |
| Asset Catalog (`src/Services/Catalog`, 5203, `catalogdb`), Assets (`src/Services/Assets`, 5204, `assetsdb`), Documents (`src/Services/Documents`, 5205, `documentsdb`, Blob/Azurite) | Built (milestone 03): asset types with fields as data, the platform template library, the asset register with site scope and limits, and files. See `docs/assets.md`. |
| Work Orders, Inventory, Notifications | Phase 3. |
| Field app (Expo) | Phase 4. |
| Search, Audit, Integration, Reporting | Phase 5. |

## Conventions

- **Sign-in:**
  - `AddInventraAuthentication()` registers JWT schemes "Platform" and "Tenant".
  - The default "Bearer" scheme picks between them by the token's issuer.
  - After validation the server stamps `inventra:realm` = platform | tenant. It never trusts that claim from the token.
  - Platform policies (`PlatformPolicies.*`) require that realm claim plus a role.
- **Errors:**
  - Use `Problems.*` and `FieldErrors` in `BuildingBlocks/Http`.
  - Messages are plain language and say how to fix the problem: "Use 3 to 32 characters.", not "Invalid slug".
- **Domain rules:**
  - Entities expose `CannotXReason()`, which returns null or a sentence.
  - Endpoints return 409 with that sentence. The UI shows it as-is.
- **Audit:** every platform-staff change writes a `PlatformAuditEntry` in the same `SaveChanges`. Client-side changes, including everything done under a support pass, go to that client's own audit log (Access).
- **Client data (row-level security):**
  - Client-scoped services use `AddTenantDatabase` and the `RowSecurityMigrations` steps, and call `ITenantContext.UseAsync` before touching data. Every table has `tenant_id` with a FORCEd policy.
  - Locally the service logs in as a superuser and switches role per connection. In Azure it runs as a login that owns no tables (`Database:RowSecurityRole=""`).
- **Client services:** use `AddClientAccess` with `RequireClientAccess`/`RequirePermission` (caller and site scope come from Access `GET /internal/caller`, cached 15 s; support passes are honoured everywhere), `AddTenantDatabase`, `CreateWolverineStorage` migrations, and a `ServiceApi<Program>` test host. Fields-as-data rules live in `Inventra.AssetModel`.
- **Wolverine handlers:** class names must end in `Handler`, or Wolverine silently ignores them.
- **Events:** publish with `IDbContextOutbox.PublishAsync` and `SaveChangesAndFlushMessagesAsync`, so an event is saved in the same transaction as the change.
- **Site scope:** lives on the person's role assignment (user + role + siteIds; empty means all sites), never on the role. The effective scope is the union of the assignments that grant a permission.
- **Contracts:** each service's API is snapshotted in `docs/contracts/<service>.openapi.json`, and a test fails when they drift apart. Regenerate with `INVENTRA_UPDATE_CONTRACTS=1`.
- **New services:** add them to `infra/services.json` (read by Bicep, the image build and the database tools), `Inventra.slnx`, the AppHost and the CI pending-model-changes step.
- **Concurrency:** entities use `Property<uint>("Version").IsRowVersion()`, which maps to PostgreSQL's `xmin`. Never add a column named `xmin`.
- **Migrations:**
  - Create them with `dotnet tool restore`, then `dotnet ef migrations add <Name> --project <service> -o Data/Migrations`.
  - Each service has a design-time factory, so no database is needed.
  - CI runs `has-pending-model-changes`.
- **Tests (.NET):**
  - Use xUnit v3 and `WebApplicationFactory` against a real PostgreSQL.
  - `tests/Inventra.Testing` gives each test class a throw-away database (`TestDatabase`) and test users (`TestUser`, sent in the `X-Test-User` header).
  - Set `INVENTRA_TEST_POSTGRES` if the server isn't localhost/postgres/postgres.
- **Web:**
  - Components use only the semantic tokens in `shared/theme/tokens.css`.
  - Disabled buttons use `<Button disabledReason="…">`. A button never silently does nothing.
  - Every list has loading, error with "Try again", and empty states.
  - Load data with `useLoad`, which derives loading state; don't set state synchronously in effects, because the react-hooks v7 lint forbids it.
  - Each app's `index.html` has the no-flash theme script; keep it in step with `shared/theme/theme.ts`.
- **OIDC callback:** use `completeSignIn()`, which redeems a code once. React StrictMode runs effects twice in development, and a second redemption fails with "Code not valid".

## The team

The Lead session is the conversation with the owner. Five team sessions each own a part of the repo: Backend (`src/Services`, `src/BuildingBlocks`, `src/Gateway`, service tests), Web (`web/`), Mobile (`mobile/`, Expo field app; see `mobile/README.md`), DevOps (`.github`, `infra`, `scripts`, `docs/deployment`) and QA (`tests/EndToEnd`, `docs/qa`; the browser suite runs in CI on main, integration and QA branches, and isn't in `Inventra.slnx`).
- Team sessions push `claude/<area>-<topic>` branches and report to the Lead.
- The Lead merges them into `claude/integration-NN`, tests everything together and sends the owner one patch per milestone.
- All sessions share the owner's 5-hour usage limit, so they run in waves and keep turns lean.

## Deployment

See `docs/deployment/`. The deploy workflow stays switched off until the repository variable `DEPLOY_ENABLED` is `true`.

## How we work

1. **Never commit to main.** Branch from `origin/main` (`claude/<topic>`), commit, and push with `git push -u origin <branch>`.
2. **Wait for CI to pass:** `.github/workflows/ci.yml`, with jobs for .NET (PostgreSQL service) and web.
3. **Send a patch, not a PR:**
   - Create it with `git diff --binary origin/main <branch> > patches/NN-name.patch` (`patches/` is git-ignored).
   - Check that it applies to a clean worktree of `origin/main` and gives exactly the branch's tree.
   - Send it with the PowerShell steps to apply it.
4. **The owner applies, commits and pushes to main themselves.** Afterwards, fetch main again: their commit hash differs from the branch.
5. Patches so far: `01` foundation · `01a` CI fix · `02` Access, client web app, Azure foundation · `03` configurable assets (in progress).

## The owner's machine

- Windows, PowerShell, often starting in `C:\Windows\system32`, so always say `cd` into the repo first.
- Use `npm.cmd` / `npx.cmd`, because PowerShell blocks `npm.ps1`.
- Port 8080 is taken, which is why Keycloak uses 18080 (`--AppHost:KeycloakPort` changes it).
- The disk has filled up before. Docker and the stack need roughly 15–20 GB free.
- Writes briefly. When a report is vague, ask one focused question; otherwise act.

## Lessons learned

- **vitest 4.1.x** crashes `npm install` on npm 10 ("Cannot read properties of null (reading 'edgesOut')") because of an optional peer. Stay on 4.0.x until npm is fixed.
- **Keycloak image:** comes from quay.io, which Claude's cloud container can't reach. For local runs there, pull `docker.io/keycloak/keycloak:<tag>` and tag it as `quay.io/keycloak/keycloak:<tag>`.
- **Windows patches drop the executable bit:** `git apply` on Windows (core.fileMode=false) turns 100755 into 100644. A patch that adds or changes a `*.sh` comes with a `git update-index --chmod=+x` step for the owner.
- **One npm install per folder:** both web apps share `web/`, so only admin-web runs `npm install` in the AppHost; client-web waits for it.
- **Docker Hub rate limits:** a docker.io pull can hit 429 and still exit 0, leaving the image missing. Check `docker images` after pulling in the cloud container.
- **`dotnet ef -c` means `--context`**, not configuration. Write `--configuration Release` (this broke the first CI run).
- **Bicep:** a parameter named `environment` shadows `environment()`, so use `az.environment()`. Azure PostgreSQL's admin has CREATEROLE but isn't a superuser.
- **Usage limit:** five sessions at once used the 5-hour limit in about 30 minutes. Run them in waves.
- **Infrastructure first:** when something hangs or flakes, check connection limits and pools before blaming the test.
- **No AI costs** unless the owner decides otherwise.
