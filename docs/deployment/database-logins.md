# Database logins: least privilege

In Azure, no service connects to PostgreSQL as the admin. Each service has two logins of its own, and each login can do one job.

| Login | Used by | Can | Cannot |
|---|---|---|---|
| `inventra_admin` (server admin) | The `db-bootstrap` job only | Create logins, grant database access | (Azure: it is **not** a superuser, only CREATEROLE + CREATEDB) |
| `svc_<service>_migrator` | The `migrate-<service>` job only | Create and change tables in its own database. It owns them. | Connect to other databases, create logins |
| `svc_<service>` | The running service | Read, insert, update and delete rows in its own database | Create, change, drop or truncate tables, write the migrations history, connect to other databases |

The runtime login owns no tables, so **row-level security policies apply to it**. Table owners skip row-level security unless it is forced, so this is the setup the Access service's tenant isolation needs.

## How it runs

The deploy workflow (`scripts/deploy/deploy.sh`) runs these steps on every deployment. Each step is safe to repeat.

1. **Passwords.** `scripts/deploy/new-secrets.sh` creates passwords only for Key Vault secrets that don't exist yet: `pg-admin-password`, `pg-<service>-runtime-password` and `pg-<service>-migrator-password`. Existing secrets are never read or replaced.
2. **Bicep** sets the server's admin password from Key Vault. It also writes `cs-<service>-runtime`, the service's connection string with its runtime password, to Key Vault.
3. **`db-bootstrap` job** (image `inventra/db-tools`, as the admin) runs `infra/db/sql/bootstrap-service.sql` for each service:
   * it creates both logins, or resets their passwords to the Key Vault values, so rotation works;
   * it sets connection limits (runtime 25, migrator 3);
   * it revokes `CONNECT` on the service's database from everyone else;
   * it grants schema `public` usage (runtime) or usage and create (migrator).
4. **`migrate-<service>` job** (as `svc_<service>_migrator`):
   * `before-migrate.sql` sets default privileges, so every table the migrator creates is readable and writable by `svc_<service>`;
   * the EF Core migrations bundle runs;
   * `after-migrate.sql` grants on all existing tables again and removes the runtime login's write access to `__EFMigrationsHistory`.
5. **Apps** start with `ConnectionStrings__<database>` taken from the Key Vault secret `cs-<service>-runtime` and `Database:MigrateOnStartup=false`.

Each job and app has its own managed identity, and it can read only its own secrets: Key Vault role assignments are made per secret, not per vault. Passwords never appear on a command line. psql reads them from the environment with `\getenv`, and Npgsql reads `PGPASSWORD`.

Locally nothing changes: Aspire still connects as `postgres` and migrates on startup.

## Tested in CI

The CI job "Container images and database logins" runs `scripts/db/test-least-privilege.sh`. It sets up PostgreSQL 17 the way Azure does: an admin with CREATEROLE that is not a superuser, and service databases owned by a group role the admin belongs to. Then it:

* runs the real `db-tools` image to bootstrap and migrate, twice each;
* checks every allowed and forbidden action in the table above;
* starts each service image as `svc_<service>` and waits until `/health` reports Healthy.

## Adding a service

Add it to `infra/services.json` with its project, database name and whether it uses Blob Storage. Bicep, the images, the jobs, the passwords and the test all pick it up from there. The service must not need extensions or other superuser-only features. If it needs an extension, allow it in the server parameter `azure.extensions` and create it in a migration that runs as the migrator.

## Later options

* **Passwordless logins**: Entra ID authentication with each app's managed identity (`pgaadauth_create_principal`) removes the passwords entirely. It needs a token provider in `BuildingBlocks` (Npgsql's `UsePeriodicPasswordProvider` with `Azure.Identity`), so it is a cross-team change.
* **Certificate checking**: connections use `SSL Mode=Require` (encrypted). `VerifyFull` would also check the server certificate, but it needs the Azure root certificates in the images.
