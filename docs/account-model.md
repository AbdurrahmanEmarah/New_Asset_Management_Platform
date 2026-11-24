# Account model

**Rule:** the platform runs the business, and each client runs its own assets.

## Platform (you and your staff), in the admin console

| Role | Can |
|---|---|
| Platform Owner | Everything: create, suspend, reactivate and close clients; change plans. |
| Support | Read clients, plans and the audit log. Request time-limited support access (patch 02). |
| Billing | Read everything; change plans. Invoices arrive later. |

**Support access** (patch 02) needs a reason and a duration. It is read-only by default and logged in the client's own audit log. Platform accounts belong to no client and can't see client data any other way.

## Clients (each company), in the web and field apps (patch 02 onwards)

- **Owner:** company profile, branding, single sign-on, subscription, transferring ownership. A company always has at least one Owner.
- **Admin:** users, roles, sites, asset types, modules, integrations, imports and exports, audit log.
- **Built-in roles**, which can be copied and edited: Asset Manager, Maintenance Planner, Technician, Storekeeper, Requester, Viewer/Auditor.
- **Permissions** are named `area.action` (e.g. `assets.dispose`), and a role can be limited to certain sites.
