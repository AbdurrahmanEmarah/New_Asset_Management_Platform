using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Inventra.Access.Api;
using Inventra.Access.Domain;
using Inventra.Access.Identity;
using Inventra.Contracts.Tenancy;
using Inventra.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Wolverine.Tracking;

[assembly: AssemblyFixture(typeof(Inventra.Access.Tests.AccessApi))]

namespace Inventra.Access.Tests;

/// <summary>A client company created for one test, with its signed-in Owner.</summary>
public sealed record Company(Guid Id, string Name, TestUser Owner);

/// <summary>
/// The Access service running in memory against one throw-away database for the whole test run.
/// Every test creates its own company, so row-level security keeps the tests apart, which is
/// itself a check that it works.
/// </summary>
public sealed class AccessApi : IAsyncLifetime
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    private TestDatabase? _db;
    private WebApplicationFactory<Program>? _factory;

    public FakeIdentityDirectory Directory { get; } = new();

    public string ConnectionString => _db!.ConnectionString;

    public IServiceProvider Services => _factory!.Services;

    public async ValueTask InitializeAsync()
    {
        _db = await TestDatabase.CreateAsync("access");
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Testing");
            b.UseSetting("ConnectionStrings:accessdb", _db.ConnectionString);
            b.UseSetting("Database:MigrateOnStartup", "true");
            b.UseSetting("Access:WebAppUrl", "https://app.example.test");
            b.ConfigureTestServices(s =>
            {
                s.AddTestAuthentication().AddTestMessaging();
                s.RemoveAll<IIdentityDirectory>();
                s.AddSingleton<IIdentityDirectory>(Directory);
            });
        });
        _ = _factory.Server;
    }

    public HttpClient Client(TestUser? user) => _factory!.CreateClient().As(user);

    /// <summary>A platform staff member acting under a support pass.</summary>
    public HttpClient SupportClient(TestUser staff, string passHeader)
    {
        var client = Client(staff);
        client.DefaultRequestHeaders.Add(SupportPass.Header, passHeader);
        return client;
    }

    /// <summary>Delivers a Tenancy event the way the bus would, and waits until it is handled.</summary>
    public Task<ITrackedSession> DeliverAsync(object message) => Services.InvokeMessageAndWaitAsync(message);

    /// <summary>Creates a client through its ClientCreated event and has its Owner accept the invitation.</summary>
    public async Task<Company> CreateCompanyAsync(string name = "Gulf Facilities Co.", int maxUsers = 25)
    {
        var id = Guid.CreateVersion7();
        var ownerEmail = $"owner-{id:N}@example.test";
        await DeliverAsync(new ClientCreated(id, name, $"c-{id:N}"[..20], "business", maxUsers, "Mona Haddad", ownerEmail, DateTimeOffset.UtcNow));

        var link = await Read<OwnerInvitationResponse>(await Client(TestUser.PlatformOwner).PostAsync($"/platform/clients/{id}/owner-invitation", null));
        var signIn = TestUser.Tenant(null, $"sub-owner-{id:N}", "Mona Haddad", ownerEmail);
        await Read<AcceptInvitationResponse>(await Client(signIn).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(link.AcceptUrl!))));
        return new Company(id, name, signIn with { TenantId = id });
    }

    /// <summary>Invites someone with these built-in roles and has them accept. Returns their signed-in identity and user id.</summary>
    public async Task<(TestUser User, Guid UserId)> AddMemberAsync(Company company, params string[] builtInRoles)
    {
        var roles = await Read<List<RoleResponse>>(await Client(company.Owner).GetAsync("/roles"));
        var roleIds = builtInRoles.Select(k => roles.Single(r => r.BuiltInKey == k).Id).ToList();
        return await AddMemberWithRolesAsync(company, roleIds);
    }

    public async Task<(TestUser User, Guid UserId)> AddMemberWithRolesAsync(Company company, IReadOnlyList<Guid> roleIds)
    {
        var n = Guid.NewGuid().ToString("N")[..8];
        var email = $"member-{n}@example.test";
        var invite = await Read<InvitationLinkResponse>(await Client(company.Owner).PostAsJsonAsync("/users", new InviteUserRequest(email, $"Member {n}", roleIds)));
        var signIn = TestUser.Tenant(null, $"sub-{n}", $"Member {n}", email);
        await Read<AcceptInvitationResponse>(await Client(signIn).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(invite.AcceptUrl))));
        return (signIn with { TenantId = company.Id }, invite.User.Id);
    }

    public static string TokenOf(string acceptUrl) => acceptUrl[(acceptUrl.IndexOf('#') + 1)..];

    public static async Task<T> Read<T>(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode} {response.RequestMessage?.Method} {response.RequestMessage?.RequestUri}: {body}");
        return JsonSerializer.Deserialize<T>(body, Json)!;
    }

    /// <summary>Asserts the status and returns the problem's detail.</summary>
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

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
        if (_db is not null) await _db.DisposeAsync();
    }
}

/// <summary>Records what Access asked the sign-in directory to do. Set FailWith to simulate an outage.</summary>
public sealed class FakeIdentityDirectory : IIdentityDirectory
{
    private readonly Lock _lock = new();
    private readonly Dictionary<string, Guid> _links = [];
    private readonly Dictionary<string, bool> _enabled = [];

    /// <summary>Subjects whose calls fail, to simulate the directory being down.</summary>
    public HashSet<string> Failing { get; } = [];

    public Guid? LinkOf(string subject) { lock (_lock) return _links.TryGetValue(subject, out var t) ? t : null; }

    public bool? EnabledOf(string subject) { lock (_lock) return _enabled.TryGetValue(subject, out var e) ? e : null; }

    public Task LinkToClientAsync(string subject, Guid tenantId, CancellationToken ct)
    {
        Fail(subject);
        lock (_lock) _links[subject] = tenantId;
        return Task.CompletedTask;
    }

    public Task SetSignInEnabledAsync(string subject, bool enabled, CancellationToken ct)
    {
        Fail(subject);
        lock (_lock) _enabled[subject] = enabled;
        return Task.CompletedTask;
    }

    private void Fail(string subject)
    {
        lock (_lock)
        {
            if (Failing.Contains(subject)) throw new IdentityDirectoryException("The sign-in service couldn't be reached, so nothing was changed. Try again in a minute.");
        }
    }
}
