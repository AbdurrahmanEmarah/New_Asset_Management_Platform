using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Inventra.Tenancy.Api;
using Inventra.Testing;

namespace Inventra.Tenancy.Tests;

public sealed class ClientApiTests(TenancyApi api) : IClassFixture<TenancyApi>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static CreateClientRequest NewClient(string slug, string plan = "business") =>
        new("Gulf Facilities Co.", slug, "uae-north", plan, "Mona Haddad", "mona@gulf-fm.example");

    private static string UniqueSlug(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20];

    private async Task<ClientResponse> CreateAsync(string slug, string plan = "business")
    {
        var response = await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/clients", NewClient(slug, plan), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ClientResponse>(Json, TestContext.Current.CancellationToken))!;
    }

    private static async Task<Dictionary<string, string[]>> ErrorsOf(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return doc.RootElement.GetProperty("errors").Deserialize<Dictionary<string, string[]>>(Json)!;
    }

    [Fact]
    public async Task Anonymous_requests_are_rejected()
    {
        var response = await api.Client(null).GetAsync("/clients", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_client_user_with_a_role_named_platform_owner_is_refused()
    {
        var client = api.Client(TestUser.TenantPretendingToBeOwner);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/clients", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/clients", NewClient(UniqueSlug("sneaky")), TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Owner_creates_a_trial_client_with_the_trial_limits_and_an_audit_entry()
    {
        var slug = UniqueSlug("trial");
        var created = await CreateAsync(slug, "trial");

        Assert.Equal("trial", created.Status);
        Assert.Equal(slug, created.Slug);
        Assert.Equal("UAE North", created.RegionName);
        Assert.Equal("mona@gulf-fm.example", created.OwnerEmail);
        Assert.NotNull(created.TrialEndsAt);
        Assert.InRange(created.TrialEndsAt!.Value - created.CreatedAt, TimeSpan.FromDays(13.9), TimeSpan.FromDays(14.1));
        Assert.Equal(new UsageLine(0, 10, "ok"), created.Usage.Users);
        Assert.Equal(500, created.Usage.Assets.Limit);

        var audit = await api.Client(TestUser.PlatformOwner)
            .GetFromJsonAsync<List<AuditEntryResponse>>($"/audit?clientId={created.Id}", Json, TestContext.Current.CancellationToken);
        var entry = Assert.Single(audit!);
        Assert.Equal("client.created", entry.Action);
        Assert.Equal("Platform Owner", entry.ActorName);
        Assert.Contains("Trial plan", entry.Details);
    }

    [Fact]
    public async Task Create_explains_every_field_problem()
    {
        var response = await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/clients",
            new CreateClientRequest("", "Bad Slug", "mars", "gold", "", "not-an-email"), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = await ErrorsOf(response);
        Assert.Equal(["name", "ownerEmail", "ownerName", "planKey", "region", "slug"], errors.Keys.Order().ToArray());
        Assert.Contains("lowercase", errors["slug"][0]);
    }

    [Theory]
    [InlineData("admin", "reserved")]
    [InlineData("ab", "3 to 32")]
    [InlineData("-gulf", "lowercase")]
    [InlineData("gulf--fm", "two dashes")]
    public async Task Sub_domain_rules_are_enforced(string slug, string expected)
    {
        var response = await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/clients", NewClient(slug), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(expected, (await ErrorsOf(response))["slug"][0]);
    }

    [Fact]
    public async Task A_sub_domain_can_only_be_used_once()
    {
        var slug = UniqueSlug("dup");
        await CreateAsync(slug);

        var again = await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/clients", NewClient(slug.ToUpperInvariant()), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Contains("already used", (await ErrorsOf(again))["slug"][0]);
    }

    [Fact]
    public async Task Support_can_read_but_cannot_create_or_suspend()
    {
        var created = await CreateAsync(UniqueSlug("support"));
        var support = api.Client(TestUser.PlatformSupport);

        Assert.Equal(HttpStatusCode.OK, (await support.GetAsync($"/clients/{created.Id}", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await support.PostAsJsonAsync("/clients", NewClient(UniqueSlug("x")), TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await support.PostAsJsonAsync($"/clients/{created.Id}/suspend", new SuspendClientRequest("test"), TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Suspend_needs_a_reason_and_reactivate_restores_the_client()
    {
        var created = await CreateAsync(UniqueSlug("susp"));
        var owner = api.Client(TestUser.PlatformOwner);
        var ct = TestContext.Current.CancellationToken;

        var noReason = await owner.PostAsJsonAsync($"/clients/{created.Id}/suspend", new SuspendClientRequest(" "), ct);
        Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);
        Assert.True((await ErrorsOf(noReason)).ContainsKey("reason"));

        var suspended = await owner.PostAsJsonAsync($"/clients/{created.Id}/suspend", new SuspendClientRequest("Invoice INV-104 unpaid for 60 days."), ct);
        var body = await suspended.Content.ReadFromJsonAsync<ClientResponse>(Json, ct);
        Assert.Equal("suspended", body!.Status);
        Assert.Equal("Invoice INV-104 unpaid for 60 days.", body.SuspendedReason);

        var twice = await owner.PostAsJsonAsync($"/clients/{created.Id}/suspend", new SuspendClientRequest("again"), ct);
        Assert.Equal(HttpStatusCode.Conflict, twice.StatusCode);
        Assert.Contains("already suspended", await twice.Content.ReadAsStringAsync(ct));

        var reactivated = await owner.PostAsync($"/clients/{created.Id}/reactivate", null, ct);
        var after = await reactivated.Content.ReadFromJsonAsync<ClientResponse>(Json, ct);
        Assert.Equal("active", after!.Status);
        Assert.Null(after.SuspendedReason);

        var audit = await owner.GetFromJsonAsync<List<AuditEntryResponse>>($"/audit?clientId={created.Id}", Json, ct);
        Assert.Equal(["client.reactivated", "client.suspended", "client.created"], audit!.Select(a => a.Action).ToArray());
    }

    [Fact]
    public async Task Billing_can_change_the_plan_but_not_back_to_trial_or_to_the_same_plan()
    {
        var created = await CreateAsync(UniqueSlug("bill"), "trial");
        var billing = api.Client(TestUser.PlatformBilling);
        var ct = TestContext.Current.CancellationToken;

        var upgraded = await billing.PutAsJsonAsync($"/clients/{created.Id}/plan", new ChangePlanRequest("business"), ct);
        var body = await upgraded.Content.ReadFromJsonAsync<ClientResponse>(Json, ct);
        Assert.Equal("business", body!.Plan.Key);
        Assert.Equal("active", body.Status);
        Assert.Null(body.TrialEndsAt);
        Assert.Equal(200, body.Usage.Users.Limit);

        Assert.Equal(HttpStatusCode.Conflict, (await billing.PutAsJsonAsync($"/clients/{created.Id}/plan", new ChangePlanRequest("business"), ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await billing.PutAsJsonAsync($"/clients/{created.Id}/plan", new ChangePlanRequest("trial"), ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await billing.PostAsJsonAsync($"/clients/{created.Id}/suspend", new SuspendClientRequest("no"), ct)).StatusCode);
    }

    [Fact]
    public async Task List_filters_by_status_and_search()
    {
        var marker = Guid.NewGuid().ToString("N")[..8];
        var owner = api.Client(TestUser.PlatformOwner);
        var ct = TestContext.Current.CancellationToken;
        var a = await CreateAsync($"a-{marker}", "starter");
        var b = await CreateAsync($"b-{marker}", "trial");
        await owner.PostAsJsonAsync($"/clients/{a.Id}/suspend", new SuspendClientRequest("Test"), ct);

        var all = await owner.GetFromJsonAsync<List<ClientResponse>>($"/clients?search={marker}", Json, ct);
        Assert.Equal(2, all!.Count);

        var suspended = await owner.GetFromJsonAsync<List<ClientResponse>>($"/clients?status=suspended&search={marker}", Json, ct);
        Assert.Equal(a.Id, Assert.Single(suspended!).Id);

        var attention = await owner.GetFromJsonAsync<List<ClientResponse>>($"/clients?status=attention&search={marker}", Json, ct);
        Assert.Equal(b.Id, Assert.Single(attention!).Id);
    }

    [Fact]
    public async Task Unknown_client_returns_a_plain_not_found()
    {
        var response = await api.Client(TestUser.PlatformOwner).GetAsync($"/clients/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("No client has this id", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
