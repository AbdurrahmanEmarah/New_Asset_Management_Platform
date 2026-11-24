# Architecture

The living [system map](system-map.html) has the diagrams. This file records the decisions behind them.

## Shape

```
Admin console ─┐
Web app ───────┼─► Gateway (YARP) ─► Services ─► one PostgreSQL database each
Field app ─────┘         │               │
Public API ──────────────┘               └─► Message bus (outbox; RabbitMQ locally, Azure Service Bus in Azure)
                    Identity: Keycloak locally, Entra External ID in Azure
```

## Decisions

| Decision | Why |
|---|---|
| **.NET 10 (LTS)**, not .NET 11 | Long-term support until Nov 2028. .NET 11 is a short-term release. |
| **One shared chassis** (`src/BuildingBlocks`) | Telemetry, health checks, sign-in, policies, database setup and error responses work the same everywhere. |
| **Gateway** in front of all services | Apps have one address. Tokens are checked at the edge and again in each service. |
| **One database per service** | Services can't reach into each other's data. They share facts through events. |
| **Row-level security on `tenant_id`** (from the first client-scoped service) | A query can only see its own client's rows, even if application code has a bug. |
| **Two sign-in realms** | `inventra-platform` for staff, `inventra` for client users. The server marks each identity with its realm (`inventra:realm`) after validation and never trusts that claim from the token. A client user with a role named "platform-owner" is still refused. |
| **Usage limits enforced by the platform** | Warn at 80%, block at 100%. Tenancy owns plans and limits; other services report usage to it through events. |
| **Every staff action is audited** in the same transaction as the change | The audit can't miss a change or record one that didn't happen. |
| **Connection pools capped** (`Database:MaxPoolSize`, default 10) | Twelve services with the default pool of 100 can exhaust PostgreSQL's connections. |
| **snake_case database names** | Plain SQL (row-level security policies, reports) stays readable. |
| **Configurable asset types as data** (JSONB with validation) | Clients define their own fields without code changes. Arrives in phase 2. |

## Services

| Service | Owns | Status |
|---|---|---|
| Tenancy & Admin | Clients, plans, limits, platform audit | **Built (patch 01)** |
| Access | Users, roles, permissions, site scope, invites, support access | Patch 02 |
| Asset Catalog | Asset types, fields, statuses, presets | Phase 2 |
| Assets | Register, hierarchy, locations | Phase 2 |
| Documents | Files and photos (Blob Storage) | Phase 2 |
| Work Orders | Jobs, life cycle, preventive maintenance schedules | Phase 3 |
| Inventory | Parts and stock | Phase 3 |
| Notifications | Email, push, in-app | Phase 3 |
| Search, Audit, Integration, Reporting | Cross-cutting features | Phase 5 |

## Requests and permissions

1. The **gateway** requires a valid token on every `/api/**` route (401 otherwise).
2. The **service** checks the permission or platform policy (403 otherwise).
3. From Access onwards, the service also checks the role's **site scope**.
4. **PostgreSQL row-level security** limits rows to the caller's client.

The screens hide buttons a user can't use, but only for convenience. The server always checks again.
