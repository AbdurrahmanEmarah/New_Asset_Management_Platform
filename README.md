# Inventra

A multi-tenant asset management platform. Each client company tracks its own kinds of assets: equipment, vehicles, IT, fire safety and anything else, with fields, statuses and roles it defines itself. Work orders, preventive maintenance, parts and a field app for technicians follow in later releases.

- **Platform admin console** (`web/apps/admin`): for you and your staff. Manage clients, plans and limits, and see the audit log.
- **Client web app and field app:** coming in the next releases.
- **Backend:** .NET 10 services behind a gateway, PostgreSQL (one database per service), Keycloak locally and Entra External ID in Azure.

## Run it locally (Windows, PowerShell)

You need the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0), [Node.js 22](https://nodejs.org/), and Docker Desktop running.

```powershell
cd C:\path\to\New_Asset_Management_Platform
dotnet run --project src/AppHost/Inventra.AppHost
```

The Aspire dashboard opens. When everything is green, open **http://localhost:5173** and sign in:

| Account | Password | Role |
|---|---|---|
| `owner@inventra.local` | `Inventra-dev-1` | Platform Owner (everything) |
| `support@inventra.local` | `Inventra-dev-1` | Support (read only) |
| `billing@inventra.local` | `Inventra-dev-1` | Billing (change plans) |

These accounts exist only in your local Keycloak. See [docs/local-development.md](docs/local-development.md) for ports, tests and troubleshooting.

## Documents

- [docs/architecture.md](docs/architecture.md): how the system is built and why.
- [docs/account-model.md](docs/account-model.md): who is responsible for what.
- [docs/system-map.html](docs/system-map.html): the living system map (also published as a page).
- [docs/design.md](docs/design.md): the theme and where the mockups are.
- [CLAUDE.md](CLAUDE.md): working rules and conventions for this repo.
