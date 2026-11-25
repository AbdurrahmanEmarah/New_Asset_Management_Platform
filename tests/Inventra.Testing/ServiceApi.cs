using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Wolverine;
using Xunit;

namespace Inventra.Testing;

/// <summary>
/// A client service running in memory against one throw-away database, with test sign-in, the fake
/// caller directory (instead of Access), in-process messaging and captured logs. Each test uses its
/// own client id, so row-level security keeps tests apart.
/// </summary>
public abstract class ServiceApi<TProgram> : IAsyncLifetime where TProgram : class
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    private TestDatabase? _db;
    private WebApplicationFactory<TProgram>? _factory;

    protected abstract string Name { get; }
    protected abstract string ConnectionName { get; }

    /// <summary>Extra settings and test services for this service.</summary>
    protected virtual void Configure(IWebHostBuilder builder) { }

    /// <summary>Recording handlers for the events this service publishes.</summary>
    protected virtual Type[] ObservedHandlers => [];

    public PublishedEvents Events { get; } = new();
    public CapturedLogs Logs { get; } = new();
    public string ConnectionString => _db!.ConnectionString;
    public IServiceProvider Services => _factory!.Services;

    public async ValueTask InitializeAsync()
    {
        _db = await TestDatabase.CreateAsync(Name);
        _factory = new WebApplicationFactory<TProgram>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Testing");
            b.UseSetting($"ConnectionStrings:{ConnectionName}", _db.ConnectionString);
            b.UseSetting("Database:MigrateOnStartup", "true");
            b.UseSetting("Database:RowSecurityRole", "inventra_app");
            b.ConfigureLogging(l => l.AddProvider(Logs));
            b.ConfigureTestServices(s =>
            {
                s.AddTestAuthentication().AddTestMessaging().AddTestCallers();
                s.AddSingleton(Events);
                s.ConfigureWolverine(o =>
                {
                    o.Discovery.IncludeType(typeof(ObservedSharedEvents));
                    foreach (var t in ObservedHandlers) o.Discovery.IncludeType(t);
                });
            });
            Configure(b);
        });
        _ = _factory.Server;
    }

    public HttpClient Client(TestUser? user) => _factory!.CreateClient().As(user);

    /// <summary>Platform staff acting under a test support pass for this client ("read" or "change").</summary>
    public HttpClient Support(Guid clientId, string access = "read")
    {
        var client = Client(TestUser.PlatformSupport);
        client.DefaultRequestHeaders.Add("X-Support-Pass", $"test:{clientId}:{access}");
        return client;
    }

    /// <summary>Delivers an event the way the bus would, and waits until it is handled.</summary>
    public async Task DeliverAsync(object message)
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(message);
    }

    public static async Task<T> Read<T>(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode} {response.RequestMessage?.Method} {response.RequestMessage?.RequestUri}: {body}");
        return JsonSerializer.Deserialize<T>(body, Json)!;
    }

    public static async Task<string> Problem(HttpResponseMessage response, HttpStatusCode expected)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(expected == response.StatusCode, $"Expected {(int)expected}, got {(int)response.StatusCode}: {body}");
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetProperty("detail").GetString()!;
    }

    public static async Task<Dictionary<string, string[]>> FieldErrors(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"Expected 400, got {(int)response.StatusCode}: {body}");
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.GetProperty("errors").Deserialize<Dictionary<string, string[]>>(Json)!;
    }

    /// <summary>
    /// Compares /openapi/v1.json with docs/contracts/{name}.openapi.json, which the apps build against.
    /// Run the tests with INVENTRA_UPDATE_CONTRACTS=1 to refresh the file.
    /// </summary>
    public async Task AssertContractAsync(string contract)
    {
        var live = Format(await Client(null).GetStringAsync("/openapi/v1.json"));
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Inventra.slnx"))) dir = dir.Parent;
        var path = Path.Combine(dir!.FullName, "docs", "contracts", $"{contract}.openapi.json");
        if (Environment.GetEnvironmentVariable("INVENTRA_UPDATE_CONTRACTS") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, live);
            return;
        }

        Assert.True(File.Exists(path), $"{path} is missing. Run the tests with INVENTRA_UPDATE_CONTRACTS=1 to create it.");
        Assert.True(Format(await File.ReadAllTextAsync(path)) == live,
            $"The {contract} API changed but docs/contracts/{contract}.openapi.json didn't. Run the tests with INVENTRA_UPDATE_CONTRACTS=1 and commit the file.");
    }

    /// <summary>
    /// Every table in public has tenant_id with a forced tenant_isolation policy, except the listed shared ones
    /// (which must have no tenant_id), and the restricted role can't bypass row-level security.
    /// </summary>
    public async Task AssertRowSecurityAsync(IEnumerable<string> tenantTables, params string[] sharedTables)
    {
        await using var conn = new Npgsql.NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new Npgsql.NpgsqlCommand("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'),
                   EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id')
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '__EFMigrationsHistory'
            """, conn);
        var seen = new List<string>();
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var table = reader.GetString(0);
                seen.Add(table);
                if (sharedTables.Contains(table))
                {
                    Assert.False(reader.GetBoolean(4), $"{table} is listed as shared but has a tenant_id column.");
                    continue;
                }

                Assert.True(reader.GetBoolean(4), $"{table} has no tenant_id column.");
                Assert.True(reader.GetBoolean(1) && reader.GetBoolean(2), $"{table} doesn't have forced row-level security.");
                Assert.True(reader.GetBoolean(3), $"{table} has no tenant_isolation policy.");
            }
        }

        Assert.Equal(tenantTables.Concat(sharedTables).Order(), seen.Order());
    }

    private static string Format(string json)
    {
        var node = JsonNode.Parse(json)!;
        node.AsObject().Remove("servers");
        return node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }).ReplaceLineEndings("\n") + "\n";
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
        if (_db is not null) await _db.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}

/// <summary>Stands in for Access and Tenancy: records the shared events every client service publishes.</summary>
public static class ObservedSharedEvents
{
    public static void Handle(Inventra.Contracts.Shared.ClientActivityRecorded m, PublishedEvents e) => e.Add(m);

    public static void Handle(Inventra.Contracts.Shared.PlatformChangeRecorded m, PublishedEvents e) => e.Add(m);

    public static void Handle(Inventra.Contracts.Shared.ClientLimitsRequested m, PublishedEvents e) => e.Add(m);
}
