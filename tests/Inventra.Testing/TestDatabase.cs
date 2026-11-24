using Npgsql;

namespace Inventra.Testing;

/// <summary>
/// A throw-away PostgreSQL database for one test class. Set INVENTRA_TEST_POSTGRES to a server
/// connection string (default: Host=localhost;Username=postgres;Password=postgres).
/// </summary>
public sealed class TestDatabase : IAsyncDisposable
{
    public const string EnvironmentVariable = "INVENTRA_TEST_POSTGRES";

    private readonly string _server;

    private TestDatabase(string server, string name)
    {
        _server = server;
        Name = name;
        ConnectionString = new NpgsqlConnectionStringBuilder(server) { Database = name, MaxPoolSize = 10 }.ConnectionString;
    }

    public string Name { get; }
    public string ConnectionString { get; }

    public static async Task<TestDatabase> CreateAsync(string prefix)
    {
        var server = Environment.GetEnvironmentVariable(EnvironmentVariable) ?? "Host=localhost;Username=postgres;Password=postgres";
        var name = $"test_{prefix}_{Guid.NewGuid():N}"[..40];
        await using var conn = new NpgsqlConnection(new NpgsqlConnectionStringBuilder(server) { Database = "postgres", Pooling = false }.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", conn);
        await cmd.ExecuteNonQueryAsync();
        return new TestDatabase(server, name);
    }

    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection(new NpgsqlConnectionStringBuilder(_server) { Database = "postgres", Pooling = false }.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{Name}\" WITH (FORCE)", conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
