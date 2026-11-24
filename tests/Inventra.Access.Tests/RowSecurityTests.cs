using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Inventra.Access.Tests;

/// <summary>
/// PostgreSQL itself keeps clients apart. These tests use the service's own database setup and
/// deliberately "forget" to filter by client, the bug row-level security exists to contain.
/// </summary>
public sealed class RowSecurityTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<(AsyncServiceScope Scope, AccessDbContext Db)> ScopeFor(Guid? tenantId)
    {
        var scope = api.Services.CreateAsyncScope();
        if (tenantId is { } id) await scope.ServiceProvider.GetRequiredService<ITenantContext>().UseAsync(id, Ct);
        return (scope, scope.ServiceProvider.GetRequiredService<AccessDbContext>());
    }

    [Fact]
    public async Task Every_Access_table_has_a_forced_tenant_policy()
    {
        await using var conn = new NpgsqlConnection(api.ConnectionString);
        await conn.OpenAsync(Ct);
        await using var cmd = new NpgsqlCommand("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'),
                   EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '__EFMigrationsHistory'
            ORDER BY c.relname
            """, conn);
        var tables = new List<string>();
        await using (var reader = await cmd.ExecuteReaderAsync(Ct))
        {
            while (await reader.ReadAsync(Ct))
            {
                var table = reader.GetString(0);
                tables.Add(table);
                Assert.True(reader.GetBoolean(4), $"{table} has no tenant_id column.");
                Assert.True(reader.GetBoolean(1), $"{table} doesn't have row-level security enabled.");
                Assert.True(reader.GetBoolean(2), $"{table} doesn't force row-level security on its owner.");
                Assert.True(reader.GetBoolean(3), $"{table} has no tenant_isolation policy.");
            }
        }

        Assert.Equal(AccessDbContext.TenantTables.Order(), tables.Order());
    }

    [Fact]
    public async Task The_restricted_role_cannot_bypass_row_level_security()
    {
        await using var conn = new NpgsqlConnection(api.ConnectionString);
        await conn.OpenAsync(Ct);
        await using var cmd = new NpgsqlCommand($"SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '{RowSecurity.DefaultRole}'", conn);
        await using var reader = await cmd.ExecuteReaderAsync(Ct);
        Assert.True(await reader.ReadAsync(Ct), $"Role {RowSecurity.DefaultRole} doesn't exist.");
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));
    }

    [Fact]
    public async Task A_query_that_forgets_to_filter_only_sees_its_own_client()
    {
        var a = await api.CreateCompanyAsync("Alpha Ltd");
        var b = await api.CreateCompanyAsync("Bravo Ltd");

        var (scope, db) = await ScopeFor(a.Id);
        await using (scope)
        {
            var users = await db.Users.ToListAsync(Ct);
            Assert.NotEmpty(users);
            Assert.All(users, u => Assert.Equal(a.Id, u.TenantId));
            Assert.DoesNotContain(await db.Clients.Select(c => c.TenantId).ToListAsync(Ct), id => id == b.Id);
            Assert.Equal(0, await db.Roles.CountAsync(r => r.TenantId == b.Id, Ct));

            // Even hand-written SQL that names the other client gets nothing back.
            var raw = await db.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM users WHERE tenant_id = {b.Id}").SingleAsync(Ct);
            Assert.Equal(0, raw);
        }
    }

    [Fact]
    public async Task No_client_set_means_no_rows()
    {
        await api.CreateCompanyAsync();
        var (scope, db) = await ScopeFor(null);
        await using (scope)
        {
            Assert.Equal(0, await db.Users.CountAsync(Ct));
            Assert.Equal(0, await db.Clients.CountAsync(Ct));
            Assert.Equal(0, await db.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM audit_entries").SingleAsync(Ct));
        }
    }

    [Fact]
    public async Task Writing_another_clients_rows_is_refused_or_has_no_effect()
    {
        var a = await api.CreateCompanyAsync("Alpha Ltd");
        var b = await api.CreateCompanyAsync("Bravo Ltd");

        var (scope, db) = await ScopeFor(a.Id);
        await using (scope)
        {
            // Insert a row that claims to belong to B while acting for A: the policy's WITH CHECK refuses it.
            db.Sites.Add(Site.Create(b.Id, "Smuggled", "SMG", DateTimeOffset.UtcNow));
            var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(Ct));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, Assert.IsType<PostgresException>(ex.InnerException).SqlState);
            db.ChangeTracker.Clear();

            // Updates and deletes aimed at B's rows touch nothing.
            Assert.Equal(0, await db.Database.ExecuteSqlAsync($"UPDATE users SET name = 'hacked' WHERE tenant_id = {b.Id}", Ct));
            Assert.Equal(0, await db.Database.ExecuteSqlAsync($"DELETE FROM audit_entries WHERE tenant_id = {b.Id}", Ct));
        }

        var (scopeB, dbB) = await ScopeFor(b.Id);
        await using (scopeB)
        {
            Assert.DoesNotContain(await dbB.Users.Select(u => u.Name).ToListAsync(Ct), n => n == "hacked");
            Assert.NotEqual(0, await dbB.AuditEntries.CountAsync(Ct));
        }
    }

    [Fact]
    public async Task Service_connections_run_as_the_restricted_role()
    {
        // Locally and in tests the login is a superuser, so each connection switches to the
        // restricted role. (Injected SQL could RESET ROLE there; in Azure the login itself is
        // restricted and owns no tables, so there is no role to go back to.)
        var a = await api.CreateCompanyAsync();
        var (scope, db) = await ScopeFor(a.Id);
        await using (scope)
        {
            var role = await db.Database.SqlQuery<string>($"SELECT current_user::text AS \"Value\"").SingleAsync(Ct);
            Assert.Equal(RowSecurity.DefaultRole, role);
            var setting = await db.Database.SqlQuery<string>($"SELECT current_setting('inventra.tenant_id') AS \"Value\"").SingleAsync(Ct);
            Assert.Equal(a.Id.ToString(), setting);
        }
    }

    [Fact]
    public async Task A_scope_acts_for_one_client_only()
    {
        var a = await api.CreateCompanyAsync("Alpha Ltd");
        var b = await api.CreateCompanyAsync("Bravo Ltd");
        await using var scope = api.Services.CreateAsyncScope();
        var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        await tenant.UseAsync(a.Id, Ct);
        await tenant.UseAsync(a.Id, Ct); // same client again is fine
        await Assert.ThrowsAsync<InvalidOperationException>(() => tenant.UseAsync(b.Id, Ct).AsTask());
    }

    [Fact]
    public async Task Setting_the_client_after_the_connection_opened_applies_to_it()
    {
        var a = await api.CreateCompanyAsync("Alpha Ltd");
        await using var scope = api.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AccessDbContext>();
        await db.Database.OpenConnectionAsync(Ct);
        Assert.Equal(0, await db.Users.CountAsync(Ct));

        await scope.ServiceProvider.GetRequiredService<ITenantContext>().UseAsync(a.Id, Ct);
        Assert.Equal(1, await db.Users.CountAsync(Ct));
    }

    [Fact]
    public async Task A_pooled_connection_never_carries_the_previous_client()
    {
        var a = await api.CreateCompanyAsync("Alpha Ltd");
        for (var i = 0; i < 20; i++)
        {
            var (scopeA, dbA) = await ScopeFor(a.Id);
            await using (scopeA) Assert.Equal(1, await dbA.Users.CountAsync(Ct));

            var (scopeNone, dbNone) = await ScopeFor(null);
            await using (scopeNone) Assert.Equal(0, await dbNone.Users.CountAsync(Ct));
        }
    }
}
