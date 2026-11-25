# Test plan: milestone 02 (Access)

**Scope:** the Access service and what it changes in the admin console and the new client web app: users, invitations, roles, permissions, site scope, row-level security between clients, suspension blocking sign-in, and support access passes with their audit.

**Status:** automated end to end: I1, I2, I5 (resend replaces the link), I6, U2, U3, U5, S1 (scope in `/me`), L1 (two clients side by side, lists and by id), X1, X2, X3, P1, P2, P4, P7. See [end-to-end.md](end-to-end.md). Blocked by a bug: the stale-version 409 on role edits (role saves carry no version, so a stale copy overwrites). Still to automate: I3 (expiry), U4 (ownership transfer), R1–R4, L5, P3 (expiry), P6.

## Layers

| Layer | Tool | Proves |
|---|---|---|
| **Domain** | xUnit, no database | Rules and their `CannotXReason()` sentences. |
| **API** | xUnit + `WebApplicationFactory` + real PostgreSQL (`Inventra.Testing`, `X-Test-User`) | Status codes, field errors, policies, audit rows in the same `SaveChanges`, and row-level security with a real database role. |
| **End-to-end** | `tests/EndToEnd` (AppHost + Keycloak + Chromium) | What a person sees, with real tokens from both realms. |

Each row below names its layer. **E2E** rows are the ones the QA session writes; Domain and API rows are listed so the Backend session's tests and ours together cover the whole milestone. Every E2E test makes its own client and users (unique names), so tests never depend on each other.

## 1. Users

| ID | Case | Layer |
|---|---|---|
| U1 | A client Admin sees the user list with loading, error ("Try again") and empty states. | E2E |
| U2 | Admin deactivates a user: the user can't sign in or call the API (401/403 on the next token), and the list shows them as inactive. | API, E2E |
| U3 | A company always keeps at least one Owner: removing or demoting the last Owner returns 409 with the reason, and the UI shows it as written. | Domain, API, E2E |
| U4 | Transferring ownership: the new Owner gets Owner, the old one keeps the role they choose, both audited. | API, E2E |
| U5 | Seat limit: inviting at 80% warns, at 100% blocks with a sentence that says what to do (upgrade the plan). Counted per client from Tenancy's limits. | API, E2E |
| U6 | User emails are unique per client, not across clients: the same email can belong to two clients. | API |

## 2. Invitations

| ID | Case | Layer |
|---|---|---|
| I1 | Admin invites a user with a role and optional sites; the invite appears as "Invited". | E2E |
| I2 | The invited person opens the link, sets a password in the `inventra` realm, signs in and lands in their client with the given role. Needs a local mail catcher or a dev-only "copy invite link" (see Open questions). | E2E |
| I3 | Expired, used or revoked links show a plain sentence and a way forward ("Ask your admin for a new invitation."), never a stack trace. | API, E2E |
| I4 | Inviting an email already in the client: field error on email. | API, E2E |
| I5 | Resend replaces the old link (the old one stops working). | API |
| I6 | The first Owner recorded by Tenancy when a client is created receives the owner invitation (patch 01's notice "sent once the Access service is added" disappears). | API (event via outbox), E2E |
| I7 | Outbox: an invitation is saved and its message is published exactly once, even if the service restarts between save and publish. | API |

## 3. Roles and permissions

| ID | Case | Layer |
|---|---|---|
| R1 | Built-in roles exist for every new client (Owner, Admin, Asset Manager, Maintenance Planner, Technician, Storekeeper, Requester, Viewer/Auditor) and can't be edited or deleted, only copied. The disabled buttons say why. | Domain, API, E2E |
| R2 | Copy a built-in role, rename it, change permissions (`area.action`), save; assigned users get the new permissions on their next token or request. | API, E2E |
| R3 | A role in use can't be deleted: 409 with the reason (how many users have it). | Domain, API |
| R4 | Each permission is checked by the server: a user without `users.invite` gets 403 from the API even if they craft the request; the button is hidden or disabled with a reason in the UI. | API, E2E |
| R5 | A client user whose role is literally named "platform-owner" is still refused on every platform endpoint (realm comes from the issuer, never from the token). Already covered for patch 01; repeat against Access endpoints. | API |
| R6 | Admin can't grant a permission they don't have themselves (no privilege escalation). | API |

## 4. Site scope

| ID | Case | Layer |
|---|---|---|
| S1 | A role limited to sites A and B: lists, details and counts show only A and B; a direct request for site C's item returns 404 (not 403, so existence doesn't leak). | API, E2E |
| S2 | Changing a user's sites takes effect on the next request without signing out. | API |
| S3 | "All sites" vs a list of sites is explicit in the UI, and the default for new roles is stated. | E2E |

## 5. Row-level security between clients

| ID | Case | Layer |
|---|---|---|
| L1 | With two clients A and B, every Access endpoint called as A returns none of B's rows, including list, search, by-id (404) and counts. | API, E2E (two browser contexts) |
| L2 | **Defence in depth:** a query run on A's connection with the application's `tenant_id` filter removed still returns only A's rows (PostgreSQL policy, not EF filter). Run as the service's real database role, which must not be a superuser or the table owner, and must not have `BYPASSRLS`. | API |
| L3 | A connection returned to the pool doesn't keep the previous request's tenant (`SET LOCAL` / reset per transaction). Run many alternating A/B requests with a pool of 1–2 connections. | API |
| L4 | Background work (outbox publisher, migrations) runs with an explicit tenant or a separate role, and can't read across clients by accident. | API |
| L5 | A token from client A's realm session can't be used against client B's sub-domain (tenant comes from the token's client claim, checked against the request). | API, E2E |

## 6. Suspension blocks sign-in

| ID | Case | Layer |
|---|---|---|
| X1 | Platform Owner suspends a client in the admin console; that client's users who are signed in are refused on their next request, and the web app shows the suspension reason the Owner typed. | E2E (admin + client contexts) |
| X2 | A suspended client's users can't sign in: after Keycloak, the app shows "Your company's account is suspended" with the reason and who to contact, not a generic error. | E2E |
| X3 | Reactivating restores access without new invitations. | E2E |
| X4 | Platform staff can still read a suspended client's data through a support access pass (see 7). | API |

## 7. Support access passes and their audit

| ID | Case | Layer |
|---|---|---|
| P1 | Support requests access to a client with a **reason** and a **duration** (both required, field errors in plain language; maximum duration stated). | API, E2E |
| P2 | The pass is **read-only** by default: every write endpoint returns 403 with a sentence while the pass is active; the console shows a banner with the time left. | API, E2E |
| P3 | The pass **expires**: after the duration, requests are refused without signing out (use an injected `TimeProvider` in API tests; a short pass in E2E only if the minimum allows it). | API |
| P4 | The pass is recorded **in the client's own audit log** (who, reason, start, end, what was viewed) and in the platform audit. The client's Admin can see it in their audit page. | API, E2E |
| P5 | Without a pass, platform staff can't see any client data (404/403 on every Access endpoint). | API |
| P6 | Billing can't request a pass; Owner can. Disabled buttons say why. | API, E2E |
| P7 | Revoking a pass early ends it immediately and is audited. | API, E2E |

## 8. Cross-cutting checks for every new screen

- Loading, error with "Try again", and empty states.
- No horizontal scroll at 390px.
- Light and dark themes; the choice survives a reload.
- Server errors shown as written; disabled buttons have a reason.
- No browser console errors during the flow (the suite logs them in each test's output).

## Open questions for the Lead

1. **Invitation e-mail in tests (I2, I6):** will the AppHost add a local mail catcher (e.g. Mailpit, free) so tests can read the link, or a dev-only endpoint that returns it?
2. **Client realm seed data:** will `inventra` (client realm) be imported with test users, or are all client users created through invitations? E2E needs at least two clients with an Owner each.
3. **Client web app:** which port and route does it use, and will Keycloak's `inventra` realm allow redirects to it?
4. **Row-level security role:** which database role do services connect as? L2 must run as that role, not `postgres`.
