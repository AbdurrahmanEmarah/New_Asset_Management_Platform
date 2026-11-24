using Inventra.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;

namespace Inventra.Tenancy.Tests;

/// <summary>The Tenancy service running in memory against its own throw-away database.</summary>
public sealed class TenancyApi : IAsyncLifetime
{
    private TestDatabase? _db;
    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        _db = await TestDatabase.CreateAsync("tenancy");
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Testing");
            b.UseSetting("ConnectionStrings:tenancydb", _db.ConnectionString);
            b.UseSetting("Database:MigrateOnStartup", "true");
            b.ConfigureTestServices(s =>
            {
                s.AddTestAuthentication().AddTestMessaging();
                s.AddSingleton(Events);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(ObservedTenancyEvents)));
            });
        });
        _ = _factory.Server; // start now so migrations run once
    }

    public HttpClient Client(TestUser? user) => _factory!.CreateClient().As(user);

    public IServiceProvider Services => _factory!.Services;

    public PublishedEvents Events { get; } = new();

    /// <summary>Delivers an event the way the bus would and waits until it is handled.</summary>
    public async Task DeliverAsync(object message)
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(message);
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
        if (_db is not null) await _db.DisposeAsync();
    }
}
