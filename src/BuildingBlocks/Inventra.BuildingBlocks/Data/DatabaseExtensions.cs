using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Inventra.BuildingBlocks.Data;

public static class DatabaseExtensions
{
    /// <summary>
    /// Registers a service's own DbContext on PostgreSQL with snake_case names and a capped
    /// connection pool (Database:MaxPoolSize, default 10). The cap matters: twelve services with
    /// the default pool of 100 each can exhaust PostgreSQL's connection limit.
    /// </summary>
    public static IHostApplicationBuilder AddServiceDatabase<TContext>(this IHostApplicationBuilder builder, string connectionName)
        where TContext : DbContext
    {
        var connectionString = builder.CappedConnectionString(connectionName);

        builder.Services.AddDbContext<TContext>(o => o
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention());

        builder.Services.AddHealthChecks().AddDbContextCheck<TContext>($"{connectionName}-db");
        return builder;
    }

    /// <summary>
    /// Like <see cref="AddServiceDatabase{TContext}"/>, for a service whose tables hold client data.
    /// Every connection carries the current client from <see cref="ITenantContext"/>, so PostgreSQL
    /// row-level security limits every query to that client. When Database:RowSecurityRole is set
    /// (locally and in tests, where the login is a superuser), each connection also switches to that
    /// restricted role; in Azure it stays empty and the login itself is restricted.
    /// Create the policies with <see cref="RowSecurityMigrations"/>, and call
    /// <see cref="EnsureRowSecurityAppliesAsync{TContext}"/> at startup.
    /// </summary>
    public static IHostApplicationBuilder AddTenantDatabase<TContext>(this IHostApplicationBuilder builder, string connectionName)
        where TContext : DbContext
    {
        var connectionString = builder.CappedConnectionString(connectionName);
        var role = builder.Configuration["Database:RowSecurityRole"];

        builder.Services.AddScoped<TenantContext>();
        builder.Services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
        builder.Services.AddDbContext<TContext>((sp, o) => o
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(new TenantConnectionInterceptor(sp.GetRequiredService<TenantContext>(), role)));

        builder.Services.AddHealthChecks().AddDbContextCheck<TContext>($"{connectionName}-db");
        return builder;
    }

    /// <summary>The named connection string with the pool capped at Database:MaxPoolSize (default 10).</summary>
    public static string CappedConnectionString(this IHostApplicationBuilder builder, string connectionName, int? maxPoolSize = null)
    {
        var connectionString = builder.Configuration.GetConnectionString(connectionName)
            ?? throw new InvalidOperationException($"Connection string '{connectionName}' is missing. Set ConnectionStrings:{connectionName}.");

        return new NpgsqlConnectionStringBuilder(connectionString)
        {
            MaxPoolSize = maxPoolSize ?? builder.Configuration.GetValue("Database:MaxPoolSize", 10),
        }.ConnectionString;
    }

    /// <summary>
    /// Refuses to start when the connections would bypass row-level security (a superuser or a
    /// BYPASSRLS login with no restricted role to switch to), instead of silently showing every client's rows.
    /// </summary>
    public static async Task EnsureRowSecurityAppliesAsync<TContext>(this WebApplication app)
        where TContext : DbContext
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TContext>();
        var bypass = await db.Database
            .SqlQueryRaw<bool>("SELECT (rolsuper OR rolbypassrls) AS \"Value\" FROM pg_roles WHERE rolname = current_user")
            .SingleAsync();
        if (bypass)
        {
            throw new InvalidOperationException(
                "Row-level security would be bypassed: the database login is a superuser or has BYPASSRLS. " +
                $"Set Database:RowSecurityRole to {RowSecurity.DefaultRole} (local development), or sign in as a restricted login that owns no tables (Azure).");
        }
    }

    /// <summary>Applies pending migrations when Database:MigrateOnStartup is true (local and tests).</summary>
    public static async Task MigrateIfConfiguredAsync<TContext>(this WebApplication app)
        where TContext : DbContext
    {
        if (!app.Configuration.GetValue("Database:MigrateOnStartup", false)) return;

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TContext>();
        app.Logger.LogInformation("Applying migrations for {Context}", typeof(TContext).Name);
        using (RowSecurity.RunAsOwner())
        {
            await db.Database.MigrateAsync();
        }
    }

    /// <summary>True when a save failed on a unique index (PostgreSQL 23505).</summary>
    public static bool IsUniqueViolation(this DbUpdateException exception, string? constraint = null) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
        && (constraint is null || pg.ConstraintName == constraint);
}
