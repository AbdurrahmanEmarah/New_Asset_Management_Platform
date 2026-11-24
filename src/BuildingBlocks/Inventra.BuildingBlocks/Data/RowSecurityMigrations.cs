using Microsoft.EntityFrameworkCore.Migrations;

namespace Inventra.BuildingBlocks.Data;

/// <summary>
/// Migration steps for PostgreSQL row-level security on <c>tenant_id</c>.
/// Use them in every client-scoped service:
/// <code>
/// migrationBuilder.CreateRowSecurityRole();
/// migrationBuilder.EnableTenantRowSecurity("users");
/// </code>
/// </summary>
public static class RowSecurityMigrations
{
    /// <summary>
    /// Creates the restricted role (<see cref="RowSecurity.DefaultRole"/>) if it doesn't exist, lets the
    /// login user switch to it, and grants it data access to the service's tables. Safe to run in
    /// several databases at once (roles are shared by the whole server).
    /// In Azure the migrator may not create roles: the step then only warns, and the service runs
    /// as its own least-privilege login (not the table owner) with Database:RowSecurityRole empty,
    /// so the policies apply to that login directly.
    /// </summary>
    /// <param name="extraSchemas">Other schemas the role writes to in the same transaction, such as "wolverine" for the outbox.</param>
    public static MigrationBuilder CreateRowSecurityRole(this MigrationBuilder migration, params string[] extraSchemas)
    {
        const string role = RowSecurity.DefaultRole;
        migration.Sql($"""
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                BEGIN
                  CREATE ROLE {role} NOLOGIN NOBYPASSRLS;
                EXCEPTION
                  WHEN duplicate_object OR unique_violation THEN NULL;
                  WHEN insufficient_privilege THEN
                    RAISE WARNING 'Could not create role {role} (%). Run the service as a login that does not own the tables, with Database:RowSecurityRole empty.', SQLERRM;
                    RETURN;
                END;
              END IF;
              IF NOT pg_has_role(current_user, '{role}', 'MEMBER') THEN
                BEGIN
                  EXECUTE format('GRANT {role} TO %I', current_user);
                EXCEPTION WHEN OTHERS THEN
                  RAISE WARNING 'Could not let % switch to role {role}: %. Grant it, or set Database:RowSecurityRole to an empty value when the service already logs in as a restricted user.', current_user, SQLERRM;
                END;
              END IF;
            END
            $$;
            """);

        foreach (var schema in new[] { "public" }.Concat(extraSchemas))
        {
            migration.Sql($"CREATE SCHEMA IF NOT EXISTS {schema};");
            migration.Sql(IfRoleExists($"""
                GRANT USAGE ON SCHEMA {schema} TO {role};
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schema} TO {role};
                GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA {schema} TO {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {role};
                """));
        }

        return migration;
    }

    /// <summary>
    /// Turns on row-level security for a table, forced even for its owner, with one policy:
    /// rows are visible and writable only when their <c>tenant_id</c> matches the connection's client.
    /// </summary>
    public static MigrationBuilder EnableTenantRowSecurity(this MigrationBuilder migration, string table, string column = "tenant_id")
    {
        var expression = RowSecurity.PolicyExpression(column);
        migration.Sql($"""
            ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
            ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
            CREATE POLICY tenant_isolation ON {table} USING ({expression}) WITH CHECK ({expression});
            """);
        migration.Sql(IfRoleExists($"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {RowSecurity.DefaultRole};"));
        return migration;
    }

    private static string IfRoleExists(string statements) =>
        "DO $$\nBEGIN\n  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '" + RowSecurity.DefaultRole + "') THEN\n"
        + statements + "\n  END IF;\nEND\n$$;";
}
