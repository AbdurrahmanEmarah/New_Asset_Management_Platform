# End-to-end tests

`tests/EndToEnd/Inventra.EndToEnd.Tests` starts the **whole platform through the real AppHost** (Aspire.Hosting.Testing) and drives the admin console in **Chromium** (Playwright for .NET). Sign-in goes through the real Keycloak login page, and the admin console runs on the Vite dev server, so React StrictMode is on exactly as on a developer's machine.

The project is not in `Inventra.slnx`, so `dotnet test Inventra.slnx` stays fast and needs no Docker or browser.

## Run it on Windows

Needs Docker Desktop running, Node 22 and about 3 GB of free disk for the images and the browser (on top of the 15–20 GB the stack needs).

```powershell
cd C:\path\to\New_Asset_Management_Platform
# Stop the dev stack first: the tests use the same fixed ports (5173 and 18080).
cd web; npm.cmd install; cd ..
dotnet test tests/EndToEnd/Inventra.EndToEnd.Tests
```

The first run downloads Chromium for Playwright and the PostgreSQL and Keycloak images, which takes a few minutes. Later runs take about a minute.

| To | Do |
|---|---|
| Watch the browser | `$env:INVENTRA_E2E_HEADED = "1"` before `dotnet test`. Remove it with `Remove-Item Env:INVENTRA_E2E_HEADED`. |
| Run one test | `dotnet test tests/EndToEnd/Inventra.EndToEnd.Tests --filter "FullyQualifiedName~Billing_can_change_plans_only"` |
| See why a test failed | Open `tests\EndToEnd\Inventra.EndToEnd.Tests\bin\Debug\net10.0\e2e-artifacts`. It has a full-page screenshot and a trace (`.trace.zip`) of each failed test, and `stack.log` with every service's console output. Open a trace by dragging it onto https://trace.playwright.dev (the file stays in your browser). |

Each run starts with **empty, throw-away data**: the tests remove the AppHost's named volumes, so the realm is imported fresh and your own dev data (`inventra-postgres`, `inventra-keycloak`) is never touched.

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs on `main`, `claude/integration-*` and `claude/qa-*` branches, and on demand (Actions → CI → Run workflow). When it fails, it uploads the `e2e-artifacts` folder (screenshots, traces, `stack.log`) to the run, kept for 14 days.

## How the suite is built

| File | What it does |
|---|---|
| `PlatformStack.cs` | Assembly fixture: starts the AppHost once per run (fixed ports, no volumes), waits for Keycloak, Tenancy and the gateway to be healthy and the console to answer, then starts one Chromium. Captures every resource's logs into `stack.log`. |
| `BrowserTest.cs` | Base class: one browser context per signed-in person, tracing for each test (kept only on failure), sign-in through the Keycloak page, and helpers for creating clients and checking for sideways scrolling. |
| `Ordering.cs` | Runs `FirstRunTests` first, because the empty state only exists before any client is created. |
| `*Tests.cs` | The tests. Every test except the first creates its own uniquely named client, so tests don't depend on each other. |

Rules for new tests:

- Find elements the way a person does: by role and accessible name (`GetByRole`, `GetByLabel`), not CSS classes.
- Wait with `Expect(...)`, never with `Task.Delay`. When a test is flaky, find the cause (timing, pools, StrictMode running effects twice) instead of adding retries.
- Run a new test three times in a row before handing it off.

## Patch 01 coverage

| Flow | Test |
|---|---|
| Sign-in through Keycloak (code redeemed once under StrictMode) | `FirstRunTests.Owner_signs_in_through_Keycloak_and_sees_the_empty_state` |
| Empty state (clients and audit log) | same |
| Create a client | `OwnerTests.Creates_a_client` |
| Duplicate sub-domain shows its field error | `OwnerTests.A_duplicate_sub_domain_shows_its_field_error` |
| Suspend needs a reason; reactivate | `OwnerTests.Suspend_needs_a_reason_and_reactivate_restores_the_client` |
| Change plan | `OwnerTests.Changes_a_clients_plan` |
| The audit log shows each action, newest first, with who and why | `OwnerTests.The_audit_log_shows_each_action` |
| Support is read-only and each button says why | `RoleTests.Support_is_read_only_and_each_button_says_why` |
| Billing can change plans only | `RoleTests.Billing_can_change_plans_only` |
| The theme choice survives a reload | `LayoutTests.The_theme_choice_survives_a_reload` |
| Nothing scrolls sideways at 390px (sign-in, clients, dialog, audit log) | `LayoutTests.Nothing_scrolls_sideways_at_phone_width` |
