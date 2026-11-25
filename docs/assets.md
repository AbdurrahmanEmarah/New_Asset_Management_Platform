# Configurable assets: Catalog, Assets and Documents

Milestone 03. The contracts are [catalog](contracts/catalog.openapi.json), [assets](contracts/assets.openapi.json) and [documents](contracts/documents.openapi.json). Through the gateway they're under `/api/catalog/**`, `/api/assets/**` and `/api/documents/**`.

| Service | Port | Database | Owns |
|---|---|---|---|
| Catalog | 5203 | `catalogdb` | Asset types (fields and statuses as data) and the platform's template library |
| Assets | 5204 | `assetsdb` | The register: tags, hierarchy, field values, sites |
| Documents | 5205 | `documentsdb` | Files attached to assets, on Blob storage |

## Asset types (Catalog)

- A type has a name, a **tag prefix** (2–8 letters or digits, unique per client), an icon key, **fields** and **statuses**.
- **Field kinds:** text, number (with unit), date, choice (one or several), person (an Access user id), asset (a link to another asset) and file (a Documents id).
- **Fields:** each has a stable `key` (made from the label when created, never changed), a label, a required flag and an order.
- **Rules:** each field's rules are stored as JSONB: lengths, pattern with a hint, min/max, decimals, unit, options, multiple, not in the future.
- **One validator for both services:** `src/BuildingBlocks/Inventra.AssetModel` checks definitions in Catalog and values in Assets, so both give the same plain messages.
- **Statuses:** each maps to one meaning, `ok`, `warn`, `fault`, `info` or `none`, which sets its colour and shape in the apps.
- **Editing:**
  - Edits send the `version` they started from; a newer version answers 409.
  - A field's kind can't change once it exists.
  - Removing a field keeps its old values readable in Assets (`otherValues`).
  - Archiving a type stops new assets of that type; existing assets keep it.
- **Template library:** global presets (seeded: HVAC unit, vehicle, pump, IT device). The Platform Owner manages them at `/platform/templates`, and every change is written to the platform audit log. Clients copy one with `POST /types/from-template`; the copy doesn't change when the template does.
- **Permissions:** `settings.manage` edits types; `assets.read` reads them.

## The register (Assets)

- **How Assets learns types:** Catalog publishes `AssetTypePublished` (the whole definition) on every change. Assets keeps the latest version, so it validates without calling Catalog. A type created a moment ago may need a few seconds before assets can use it (409 says so).
- **Tags** are `PREFIX-000001`, numbered per type, and never change, even if the prefix does.
- **Hierarchy:** an optional parent. Loops are refused, and the depth is at most 20 levels. An asset with active children can't be retired.
- **Values:** stored in JSONB and checked against the type's current fields.
- **Listing:** filter by type, site, status, parent or search (tag or name). Pages go up to 200 rows. Sort by `tag`, `name`, `status`, `updated` or `field:<key>`. When filtered by one type, the page includes `columns` (the type's fields) and each row's values.
- **Site scope:** comes from Access.
  - Each client service asks `GET /internal/caller` on Access with the caller's own token and support pass. The answer is cached for 15 seconds per token.
  - It carries the permissions and each role assignment's sites. The sites for a permission are the union of the assignments that grant it, and an all-sites assignment wins.
  - Assets with no site are visible only to all-sites callers.
  - Outside your sites an asset answers 404. Visible but not editable answers 403.
  - Moving needs "Transfer between sites" at both sites; retiring needs "Retire or dispose".
- **Site ids aren't yet checked against Access's site list.** Assets accepts any site within the caller's scope.
- **Plan limit:** the asset limit (from `ClientCreated` / `ClientPlanChanged`) blocks at 100% with a sentence. Every create and retire sends `ClientAssetsCounted` to Tenancy.

## Files (Documents)

- **Uploads:** PDF, PNG, JPEG or WebP, recognised by their first bytes, up to 25 MB, as the multipart field `file`.
- **Checking the asset:** Documents asks Assets about the asset with the caller's token, so a file is visible exactly when its asset is.
- **Downloads:** `GET /documents/{id}/link` gives a 5-minute SAS link. Locally it is signed with the account key (Azurite); in Azure with a user delegation key (managed identity, `Storage:BlobEndpoint` from Bicep).
- **Storage:** the plan's limit blocks at 100%. Every upload and delete sends `ClientStorageCounted` to Tenancy.

## Shared by every client service

- **The gate:** `BuildingBlocks.Messaging/Clients/ClientAccess.cs` holds `AddClientAccess`, `RequireClientAccess()` and `RequirePermission(...)`. The gate resolves the caller, points row-level security at the caller's client, and handles **support passes**: read-only unless change, and every request recorded, refused writes included.
- **Audit:** every change publishes `ClientActivityRecorded` through the outbox, in the same transaction. Access writes it to the client's audit log, so `GET /api/access/audit` shows everything.
- **Platform changes:** platform-level changes publish `PlatformChangeRecorded`, which Tenancy writes to the platform audit log.
- **Database:** each service has row-level security on every client table (Catalog's `templates` is the one shared table), and Wolverine's storage comes from migrations.

## Locally

The AppHost runs the three services and Azurite (volume `inventra-azurite`). Documents gets `ConnectionStrings:documents-blobs` from it.
