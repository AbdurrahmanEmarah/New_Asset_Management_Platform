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
| Identity | Keycloak locally (port **18080**). Realms are `inventra-platform` (staff) and `inventra` (clients, from patch 02). Entra External ID in Azure. |
| Web | `web/`: one npm package with apps under `web/apps/*` (admin now, client next) and shared code in `web/shared`. React 19, React Router 7, Vite 7, TypeScript 5.9, Vitest 4.0, ESLint 9. |
| Packages | Central package management in `Directory.Packages.props`. NuGet audit fails the build on advisories. |

## Services

| Service | Status |
|---|---|
| Tenancy & Admin (`src/Services/Tenancy`) | Built: clients, plans, limits, platform audit. |
| Access | Patch 02: users, roles, permissions, site scope, invites, support access, row-level security, messaging (outbox). |
| Asset Catalog, Assets, Documents | Phase 2. |
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
- **Audit:** every platform-staff change writes a `PlatformAuditEntry` in the same `SaveChanges`.
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

## How we work

1. **Never commit to main.** Branch from `origin/main` (`claude/<topic>`), commit, and push with `git push -u origin <branch>`.
2. **Wait for CI to pass:** `.github/workflows/ci.yml`, with jobs for .NET (PostgreSQL service) and web.
3. **Send a patch, not a PR:**
   - Create it with `git diff --binary origin/main <branch> > patches/NN-name.patch` (`patches/` is git-ignored).
   - Check that it applies to a clean worktree of `origin/main` and gives exactly the branch's tree.
   - Send it with the PowerShell steps to apply it.
4. **The owner applies, commits and pushes to main themselves.** Afterwards, fetch main again: their commit hash differs from the branch.
5. Patches so far: `01` foundation.

## The owner's machine

- Windows, PowerShell, often starting in `C:\Windows\system32`, so always say `cd` into the repo first.
- Use `npm.cmd` / `npx.cmd`, because PowerShell blocks `npm.ps1`.
- Port 8080 is taken, which is why Keycloak uses 18080 (`--AppHost:KeycloakPort` changes it).
- The disk has filled up before. Docker and the stack need roughly 15–20 GB free.
- Writes briefly. When a report is vague, ask one focused question; otherwise act.

## Lessons learned

- **vitest 4.1.x** crashes `npm install` on npm 10 ("Cannot read properties of null (reading 'edgesOut')") because of an optional peer. Stay on 4.0.x until npm is fixed.
- **Keycloak image:** comes from quay.io, which Claude's cloud container can't reach. For local runs there, pull `docker.io/keycloak/keycloak:<tag>` and tag it as `quay.io/keycloak/keycloak:<tag>`.
- **Infrastructure first:** when something hangs or flakes, check connection limits and pools before blaming the test.
- **No AI costs** unless the owner decides otherwise.
