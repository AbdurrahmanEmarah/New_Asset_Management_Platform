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

## Answered questions (milestone 02)

1. Invitation e-mail: no mail catcher; links are shown once in the apps, and the tests read them there.
2. Client realm: no seeded client users; tests register through invitations (realm `inventra`, registration on).
3. Client web app: port 5174, `/join#<token>`, allowed by the `web-app` client.
4. Row-level security: locally each connection switches to `inventra_app`; L2 belongs in Backend's API tests.

---

# Test plan: milestone 03 (configurable assets)

**Scope:** Catalog (asset types and the template library), Assets (the register, hierarchy, site scope, plan limit) and Documents (files on Blob storage, Azurite locally), and how they work with Access (site scope, support passes, client audit) and Tenancy (limits). See `docs/assets.md` on `claude/backend-assets`.

**Status:** planned. Automated once `claude/backend-assets` and `claude/web-assets` are merged into an integration branch. The stack gains Catalog, Assets, Documents and Azurite. Tests start from a client whose Owner has joined (`AccessTest.JoinedClientAsync`), with two sites added by API.

## A. The asset journey (one end-to-end test, the Lead's main flow)

| Step | What a person does | What the test checks |
|---|---|---|
| A1 | Owner opens Settings → Asset types → "From template" and picks **HVAC unit** | The type appears with the template's fields and statuses; its tag prefix is shown; the client audit has "created type". |
| A2 | Owner adds an asset at **site A** with the type's fields (text, number with unit, date, choice) | Tag is `PREFIX-000001`; values show as entered, with units; a required field left empty shows its field error first. A type used within seconds of being created may answer 409 "try again in a few seconds": the test clicks Try again like a person, for at most 20 s. |
| A3 | Owner uploads a **photo** (PNG) on the asset and downloads it | The upload lists name, size and type; the download link returns the same bytes (SHA-256 compared); the link expires (5 minutes, checked by API only). |
| A4 | Owner invites a **Technician limited to site B**, who joins | As the Technician: the site-A asset isn't in the list; opening its URL shows "not found"; `GET /api/assets/assets/{id}` → 404; its photo's `/link` → 404 (Documents follows Assets). |
| A5 | Plan limit: Trial allows 500 assets, too many for a browser; the API fills it (a smaller plan, or seeded counts if Backend offers one) | At 100%: `POST` answers 409 with the plan sentence; the "New asset" button is disabled with the same reason; the Tenancy usage bar in the admin console shows red. |
| A6 | Support opens a **read-only pass** for the client | With `X-Support-Pass`: list and view assets and the photo link → 200; create, edit, upload → 403. The client's Support access page shows the pass with its actions counted, and the client audit (`GET /api/access/audit`) lists the views and the refused writes with Support's name. |

## B. Asset types (Catalog)

| ID | Case | Layer |
|---|---|---|
| T1 | Field kinds and rules: each kind rejects a bad value with the shared validator's sentence (Catalog and Assets give the same message). | API (Backend), one E2E for the form |
| T2 | Tag prefix 2–8 letters or digits, unique per client; a duplicate shows its field error; two clients can use the same prefix. | API, E2E |
| T3 | Editing with a stale `version` answers 409 with its sentence, and the page says to reload (the fix wanted for roles, BUG A). | API, E2E |
| T4 | A field's kind can't change; removing a field keeps old values readable (`otherValues`). | API |
| T5 | Archiving a type stops new assets of that type ("New asset" says why), and existing assets keep it. | API, E2E |
| T6 | Template library: only the Platform Owner edits templates (Support/Billing see why not); every change is in the platform audit; a client's copy doesn't change when the template does. | API, E2E (admin console) |

## C. The register (Assets)

| ID | Case | Layer |
|---|---|---|
| R1 | Tags never change, even after the prefix changes; numbering is per type. | API |
| R2 | Hierarchy: loops refused, depth at most 20, an asset with active children can't be retired (button says why). | API, E2E |
| R3 | List filters (type, site, status, parent, search) and sort, including `field:<key>`; columns follow the chosen type. Loading, error with Try again, and empty states. | E2E |
| R4 | Moving between sites needs Transfer at both sites; retiring needs Retire or dispose; visible but not editable answers 403 with a reason. | API, E2E |
| R5 | Unknown or inactive site refused with a sentence; a site added in Access becomes usable after `SiteCreated` arrives. | API, E2E |
| R6 | Two clients side by side: types, assets and documents of one are 404 to the other, in lists and by id (same check as L1). | E2E |
| R7 | Backfill: a client created before Assets existed (seeded) gets its sites and limits lazily; the first request may say "try again in a few seconds", and then works. | API |

## D. Files (Documents)

| ID | Case | Layer |
|---|---|---|
| D1 | Only PDF, PNG, JPEG, WebP, recognised by content (a `.png` that is really text is refused); up to 25 MB, with plain sentences. | API, E2E for one refusal |
| D2 | A file is visible exactly when its asset is (site scope, other client, support pass). | API, E2E (A4, A6) |
| D3 | Storage limit at 100% blocks uploads with its sentence; deleting frees space and updates the usage bar. | API |

## E. Cross-cutting

- Every client change shows in the client audit (`ClientActivityRecorded`), within seconds.
- New screens: no sideways scroll at 390px (asset list, asset form, type editor), both themes, no console errors.
- Dialog focus: typing straight after opening a dialog lands in the right field (BUG B regression check).

## Needed from the other sessions

1. **Azurite image:** the tag Aspire uses (I'll pull `mcr.microsoft.com/azure-storage/azurite` at that tag for CI and here).
2. **A5:** a way to reach the asset limit without 500 creates: a test-only small plan, or a bulk-create endpoint. Otherwise the test creates 500 by API (about 30 s).
3. **Accessible names** on the new screens: the type editor's field rows and the asset form's dynamic fields need labels (tests find them by label).
