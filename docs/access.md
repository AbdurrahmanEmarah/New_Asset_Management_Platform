# Access service

Users, roles, permissions, site scope, invitations and support access for client companies.
The API contract is [contracts/access.openapi.json](contracts/access.openapi.json). Through the gateway, everything is under `/api/access/**`.

## Model

- **Roles** are named sets of permissions (`area.action`, see `GET /permissions`). There are eight built-in roles; all but Owner can be edited, any role can be copied, and custom roles can be deleted once no one has them.
- **Site scope lives on the assignment**: a person has roles, each at some sites (none listed = every site). The sites for a permission are the union of the assignments that grant it, and an assignment at every site wins. The Owner role always applies everywhere.
- **Owner rules**: a company always keeps at least one Owner. Only an Owner makes, changes, deactivates or reactivates Owners. Nobody but an Owner can give a role or permission they don't hold themselves.
- **Seats** are active users plus open invitations, counted against the plan's user limit (warn at 80%, block at 100%). Every change sends `ClientUsersCounted` to Tenancy.
- **Support passes**: platform Owner or Support opens a pass for one client, with a reason and 15 minutes to 8 hours. Passes are read-only unless the Platform Owner asks for change access. Send `X-Support-Pass: <headerValue>` on Access calls. Every request under a pass, refused writes included, goes to the client's audit log. Client admins list passes and can end them.

## Joining a company

1. When Tenancy creates a client, Access sets it up from `ClientCreated`: the built-in roles, plus an Owner invitation. The admin console reissues the Owner's link with `POST /platform/clients/{id}/owner-invitation`.
2. Invitation links are `{web app}/join#<token>`. The token starts with the client id, and only its hash is stored.
3. The invitee signs in with the `inventra` realm, then calls `POST /invitations/preview` and `POST /invitations/accept`. Access sets the Keycloak user attribute `tenant_id` through the `access-service` client. The `tenant_id` mapper puts it in the token, so the app signs in again when `signInAgain` is true.
4. Every client-scoped request goes through the tenant gate. It refuses people who aren't linked, aren't members or are deactivated, and everyone in a suspended company, each with a plain reason.

## Row-level security

Every Access table has `tenant_id` and a forced policy `tenant_isolation`. Each connection sets `inventra.tenant_id` from `ITenantContext`. With no client set, no rows are visible. The reusable parts are in `BuildingBlocks/Data`: `AddTenantDatabase`, `ITenantContext` and `RowSecurityMigrations`.

- **Locally and in tests** the login is a superuser, so each connection switches to the restricted role `inventra_app` (`Database:RowSecurityRole`). That contains careless queries. Injected SQL could still run `RESET ROLE` there.
- **In Azure** the service logs in as `svc_access`, which owns no tables. Set `Database:RowSecurityRole` to an empty value there; the policies then apply to the login itself. Migrations run as the migrator. If it can't create roles, the role steps only warn. Grant `svc_access` DML on the `public` and `wolverine` schemas.

## Messaging

Wolverine with a PostgreSQL outbox (schema `wolverine` in each service's database). `AddInventraMessaging` picks the transport:

| Setting | Transport |
|---|---|
| `ServiceBus:FullyQualifiedNamespace` | Azure Service Bus with `DefaultAzureCredential`. Topics `inventra.<service>.events`, one subscription per subscriber named after it. Created by infrastructure unless `Messaging:AutoProvision=true`. |
| `ConnectionStrings:rabbitmq` (AppHost) | RabbitMQ. Fanout exchanges `inventra.<service>.events`, queues `<subscriber>.<publisher>-events`. |
| neither (tests) | In-process local queues. |

Failed handlers retry, then land in `wolverine.wolverine_dead_letters`.

| Event | From → to |
|---|---|
| `ClientCreated`, `ClientSuspended`, `ClientReactivated`, `ClientPlanChanged` | Tenancy → Access |
| `ClientUsersCounted`, `PlatformActivityRecorded` | Access → Tenancy (usage bars, platform audit) |
