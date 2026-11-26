using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

[assembly: AssemblyFixture(typeof(Inventra.EndToEnd.Tests.PlatformStack))]
// One platform, one browser, tests one after another: the tests share the stack's data, and a
// second Chromium per CPU adds nothing but flakiness on a small CI runner.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Inventra.EndToEnd.Tests;

/// <summary>
/// Starts the whole platform once per test run through the real AppHost: PostgreSQL, Keycloak with the
/// imported realm, the Tenancy service, the gateway and the admin console (Vite dev server, so React
/// StrictMode is on exactly as on a developer's machine). Then starts one Chromium.
/// </summary>
/// <remarks>
/// The ports are the AppHost's fixed ones (Keycloak 18080, admin console 5173), because Keycloak only
/// accepts sign-in redirects to http://localhost:5173. Stop a running dev stack before running these tests.
/// The data volumes are removed, so every run starts with an empty database and a freshly imported realm,
/// and a developer's own data is never touched.
/// </remarks>
public sealed class PlatformStack : IAsyncLifetime
{
    private static readonly TimeSpan StartTimeout = TimeSpan.FromMinutes(8);

    private DistributedApplication? _app;
    private IPlaywright? _playwright;

    public IBrowser Browser { get; private set; } = null!;
    public string AdminUrl { get; private set; } = null!;
    public string ClientUrl { get; private set; } = null!;
    public string GatewayUrl { get; private set; } = null!;

    /// <summary>Where screenshots and traces of failed tests go. Uploaded by CI.</summary>
    public static string ArtifactsDir { get; } = Environment.GetEnvironmentVariable("INVENTRA_E2E_ARTIFACTS")
        ?? Path.Combine(AppContext.BaseDirectory, "e2e-artifacts");

    public async ValueTask InitializeAsync()
    {
        using var cts = new CancellationTokenSource(StartTimeout);
        var ct = cts.Token;

        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Inventra_AppHost>(
            [
                // Keep the AppHost's fixed ports: the realm only allows redirects to localhost:5173.
                "DcpPublisher:RandomizePorts=false",
            ],
            (options, _) => options.DisableDashboard = true,
            ct);

        builder.Services.AddLogging(l => l
            .SetMinimumLevel(LogLevel.Information)
            .AddProvider(new CaptureProvider(_logs)));

        // Throw-away data: no named volumes, so each run starts empty and the realm is imported again.
        foreach (var resource in builder.Resources.OfType<ContainerResource>())
        {
            foreach (var volume in resource.Annotations.OfType<ContainerMountAnnotation>().Where(m => m.Type == ContainerMountType.Volume).ToList())
            {
                resource.Annotations.Remove(volume);
            }
        }

        _app = await builder.BuildAsync(ct);

        try
        {
            await _app.StartAsync(ct);
            foreach (var name in new[] { "keycloak", "rabbitmq", "tenancy", "access", "catalog", "assets", "documents", "gateway" })
            {
                await _app.ResourceNotifications.WaitForResourceHealthyAsync(name, ct);
            }
            await _app.ResourceNotifications.WaitForResourceAsync("admin-web", KnownResourceStates.Running, ct);
            await _app.ResourceNotifications.WaitForResourceAsync("client-web", KnownResourceStates.Running, ct);

            AdminUrl = _app.GetEndpoint("admin-web", "http").ToString().TrimEnd('/');
            ClientUrl = _app.GetEndpoint("client-web", "http").ToString().TrimEnd('/');
            GatewayUrl = _app.GetEndpoint("gateway", "http").ToString().TrimEnd('/');
            await WaitForHttpAsync(AdminUrl, ct);
            await WaitForHttpAsync(ClientUrl, ct);
            foreach (var realm in new[] { "inventra-platform", "inventra" })
            {
                await WaitForHttpAsync(_app.GetEndpoint("keycloak", "http") + $"realms/{realm}/.well-known/openid-configuration", ct);
            }
        }
        catch (Exception ex)
        {
            var log = SaveStackLog();
            throw new InvalidOperationException(
                $"The platform didn't start: {ex.Message}\nEvery resource's console output is in {log}. The last lines:\n{string.Join('\n', _logs.TakeLast(40))}", ex);
        }

        // Downloads Chromium for this Playwright version on first use; a no-op once it's there.
        if (Microsoft.Playwright.Program.Main(["install", "chromium"]) is var exit and not 0)
        {
            throw new InvalidOperationException($"Installing Chromium for Playwright failed (exit code {exit}). See the output above.");
        }
        _playwright = await Playwright.CreateAsync();
        Browser = await _playwright.Chromium.LaunchAsync(new()
        {
            Headless = Environment.GetEnvironmentVariable("INVENTRA_E2E_HEADED") != "1",
        });

        // Warm up both apps once. Vite compiles modules on the first request, which can take longer than
        // a test's timeouts on a cold runner; afterwards every load is quick.
        var warm = await Browser.NewPageAsync();
        foreach (var url in new[] { AdminUrl, ClientUrl })
        {
            await warm.GotoAsync(url, new() { Timeout = 180_000 });
            await Assertions.Expect(warm.GetByRole(AriaRole.Button, new() { Name = "Sign in" }))
                .ToBeVisibleAsync(new() { Timeout = 180_000 });
        }
        await warm.CloseAsync();
    }

    private readonly System.Collections.Concurrent.ConcurrentQueue<string> _logs = new();

    /// <summary>Keeps every log line, including each resource's console output (category "*.Resources.&lt;name&gt;").</summary>
    private sealed class CaptureProvider(System.Collections.Concurrent.ConcurrentQueue<string> sink) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName) => new Capture(sink, categoryName);
        public void Dispose() { }

        private sealed class Capture(System.Collections.Concurrent.ConcurrentQueue<string> sink, string category) : ILogger
        {
            private readonly string _name = category.Contains(".Resources.", StringComparison.Ordinal) ? category[(category.LastIndexOf('.') + 1)..] : category;
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (!IsEnabled(logLevel)) return;
                sink.Enqueue($"{DateTime.UtcNow:HH:mm:ss.fff} [{_name}] {formatter(state, exception)}{(exception is null ? "" : " " + exception)}");
            }
        }
    }

    /// <summary>Writes the resources' console output next to the failure artifacts.</summary>
    public string SaveStackLog()
    {
        Directory.CreateDirectory(ArtifactsDir);
        var path = Path.Combine(ArtifactsDir, "stack.log");
        File.WriteAllLines(path, _logs);
        return path;
    }

    private static async Task WaitForHttpAsync(string url, CancellationToken ct)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        while (true)
        {
            try
            {
                using var response = await http.GetAsync(url, ct);
                if (response.IsSuccessStatusCode) return;
            }
            catch (HttpRequestException)
            {
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
            }
            await Task.Delay(500, ct);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Browser is not null) await Browser.DisposeAsync();
        _playwright?.Dispose();
        if (_app is not null) await _app.DisposeAsync();
        SaveStackLog();

    }
}
