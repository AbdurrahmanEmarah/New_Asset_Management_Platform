# Local development

Commands are for **Windows PowerShell**. `cd` into the repo first (not `C:\Windows\system32`).
PowerShell blocks `npm.ps1`, so use `npm.cmd` / `npx.cmd`.

## Start everything

```powershell
dotnet run --project src/AppHost/Inventra.AppHost
```

| What | Address |
|---|---|
| Aspire dashboard | http://localhost:15180 (the login link is printed in the console) |
| Admin console | http://localhost:5173 |
| Gateway | http://localhost:5200 (all API calls go to `/api/<service>/…`) |
| Tenancy service | http://localhost:5201 (`/openapi/v1.json` describes the API) |
| Keycloak | http://localhost:18080 (admin user and password are in the dashboard, under the keycloak resource's parameters) |

Keycloak uses **18080** because 8080 is often taken. To use another port:

```powershell
dotnet run --project src/AppHost/Inventra.AppHost -- --AppHost:KeycloakPort=18081
```

The admin console must stay on 5173, because Keycloak only accepts sign-in redirects to that address.

PostgreSQL and Keycloak keep their data in Docker volumes (`inventra-postgres`, `inventra-keycloak`).
The realm file in `src/AppHost/Inventra.AppHost/realms` is imported only when Keycloak's volume is new. After changing it, remove the volume:

```powershell
docker volume rm inventra-keycloak
```

## Tests

.NET tests need a PostgreSQL server. Each test class creates and drops its own database. If PostgreSQL isn't on `localhost` with the password `postgres`, set the connection:

```powershell
$env:INVENTRA_TEST_POSTGRES = "Host=localhost;Port=5432;Username=postgres;Password=postgres"
dotnet test Inventra.slnx
```

Web checks:

```powershell
cd web
npm.cmd install
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

## Database migrations

```powershell
dotnet tool restore
dotnet ef migrations add <Name> --project src/Services/Tenancy/Inventra.Tenancy -o Data/Migrations
```

Locally, services apply their migrations on start (`Database:MigrateOnStartup=true`, set by the AppHost).
CI fails when the model has changes without a migration.

## Troubleshooting

- **"Sign-in didn't finish (Code not valid)"**: the sign-in code was already used. Click Sign in again. If it keeps happening, clear the site data for localhost:5173.
- **The admin console says the API address isn't configured**: start it through the AppHost, not with `npm run dev:admin` on its own.
- **"Can't reach the server"**: the gateway or Tenancy service isn't running. Check the Aspire dashboard.
- **Docker or WSL won't start, or the disk is full**: Docker, PostgreSQL and the services need roughly 15–20 GB free.
