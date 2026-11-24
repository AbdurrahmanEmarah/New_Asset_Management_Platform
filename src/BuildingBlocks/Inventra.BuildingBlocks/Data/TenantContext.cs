using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Inventra.BuildingBlocks.Data;

/// <summary>
/// The client (tenant) the current request or message acts for. PostgreSQL row-level security
/// reads it from the connection setting <c>inventra.tenant_id</c>, so a query can only see that
/// client's rows, even if the query itself forgets to filter.
/// </summary>
public interface ITenantContext
{
    /// <summary>The client this scope acts for, or null before <see cref="UseAsync"/> is called.</summary>
    Guid? TenantId { get; }

    /// <summary>
    /// Acts for this client from now on, including on database connections that are already open.
    /// A scope acts for one client only: switching to another client throws.
    /// </summary>
    ValueTask UseAsync(Guid tenantId, CancellationToken ct = default);
}

/// <summary>Row-level security settings shared by every client-scoped service.</summary>
public static class RowSecurity
{
    /// <summary>The PostgreSQL setting the policies compare <c>tenant_id</c> with.</summary>
    public const string Setting = "inventra.tenant_id";

    /// <summary>
    /// The role every client-scoped connection switches to. It has no BYPASSRLS, so the policies
    /// apply even when the service logs in as a superuser (as it does locally and in tests).
    /// </summary>
    public const string DefaultRole = "inventra_app";

    /// <summary>The policy expression: rows of the current client only. No client set means no rows.</summary>
    public static string PolicyExpression(string column = "tenant_id") =>
        $"{column} = nullif(current_setting('{Setting}', true), '')::uuid";

    private static readonly AsyncLocal<bool> AsOwner = new();

    /// <summary>
    /// Inside this scope, connections keep the login role and don't switch to the restricted role.
    /// Internal on purpose: only migrations use it, so application code can't bypass the policies.
    /// </summary>
    internal static IDisposable RunAsOwner()
    {
        AsOwner.Value = true;
        return new Reset();
    }

    internal static bool IsRunningAsOwner => AsOwner.Value;

    private sealed class Reset : IDisposable
    {
        public void Dispose() => AsOwner.Value = false;
    }
}

internal sealed class TenantContext : ITenantContext
{
    private readonly List<DbConnection> _open = [];

    public Guid? TenantId { get; private set; }

    public async ValueTask UseAsync(Guid tenantId, CancellationToken ct = default)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("A client id is required.", nameof(tenantId));
        if (TenantId is { } current && current != tenantId)
            throw new InvalidOperationException("This request already acts for another client. One request can only act for one client.");

        TenantId = tenantId;
        foreach (var connection in _open.ToArray()) await TenantConnectionInterceptor.ApplyAsync(connection, this, role: null, ct);
    }

    internal void Opened(DbConnection connection) => _open.Add(connection);

    internal void Closed(DbConnection connection) => _open.Remove(connection);
}

/// <summary>
/// Runs on every connection open: switches to the restricted role and sets the current client.
/// Both are set on every open, so a pooled connection never carries another request's client.
/// </summary>
internal sealed class TenantConnectionInterceptor(TenantContext tenant, string? role) : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        ApplyAsync(connection, tenant, RoleToUse, CancellationToken.None).AsTask().GetAwaiter().GetResult();
        tenant.Opened(connection);
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await ApplyAsync(connection, tenant, RoleToUse, cancellationToken);
        tenant.Opened(connection);
    }

    public override void ConnectionClosed(DbConnection connection, ConnectionEndEventData eventData) => tenant.Closed(connection);

    public override Task ConnectionClosedAsync(DbConnection connection, ConnectionEndEventData eventData)
    {
        tenant.Closed(connection);
        return Task.CompletedTask;
    }

    private string? RoleToUse => RowSecurity.IsRunningAsOwner || string.IsNullOrWhiteSpace(role) ? null : role;

    internal static async ValueTask ApplyAsync(DbConnection connection, TenantContext tenant, string? role, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = role is null
            ? $"SELECT set_config('{RowSecurity.Setting}', @tenant, false)"
            : $"SELECT set_config('{RowSecurity.Setting}', @tenant, false), set_config('role', @role, false)";
        command.Parameters.Add(new NpgsqlParameter("tenant", tenant.TenantId?.ToString() ?? ""));
        if (role is not null) command.Parameters.Add(new NpgsqlParameter("role", role));
        await command.ExecuteNonQueryAsync(ct);
    }
}
