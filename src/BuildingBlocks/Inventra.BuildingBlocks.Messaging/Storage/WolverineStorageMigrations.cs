using Microsoft.EntityFrameworkCore.Migrations;

namespace Inventra.BuildingBlocks.Messaging.Storage;

/// <summary>
/// Creates Wolverine's outbox, inbox and node tables (schema "wolverine") from an EF migration, so
/// the migrator login owns them. In Azure the runtime login can't create anything, and Wolverine
/// doesn't build its storage at runtime unless Database:MigrateOnStartup is true.
/// </summary>
public static class WolverineStorageMigrations
{
    /// <summary>The schema of the Wolverine version in use. A new version gets a new file and a new migration.</summary>
    public const string CurrentVersion = "6.63";

    /// <param name="version">Which captured schema to apply. Pass the literal version, so the migration never changes.</param>
    public static MigrationBuilder CreateWolverineStorage(this MigrationBuilder migration, string version)
    {
        var name = $"Inventra.Messaging.wolverine-{version}.sql";
        using var stream = typeof(WolverineStorageMigrations).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"No captured Wolverine schema for version {version} ({name}).");
        using var reader = new StreamReader(stream);
        var script = reader.ReadToEnd();

        // Skipped when Wolverine already built its tables (databases created before this migration).
        migration.Sql($"""
            DO $wolverine_storage$
            BEGIN
              IF to_regclass('wolverine.wolverine_incoming_envelopes') IS NULL THEN
                EXECUTE $script$
            {script}
            $script$;
              END IF;
            END
            $wolverine_storage$;
            """);
        return migration;
    }
}
