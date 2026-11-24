using System.Net.Http.Json;
using System.Text.Json;
using Inventra.Tenancy.Api;
using Inventra.Testing;

namespace Inventra.Tenancy.Tests;

public sealed class PlatformApiTests(TenancyApi api) : IClassFixture<TenancyApi>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Plans_are_listed_smallest_first()
    {
        var plans = await api.Client(TestUser.PlatformSupport).GetFromJsonAsync<List<PlanResponse>>("/plans", Json, TestContext.Current.CancellationToken);
        Assert.Equal(["trial", "starter", "business", "enterprise"], plans!.Select(p => p.Key).ToArray());
        Assert.True(plans![0].IsTrial);
        Assert.Contains("inventory", plans[2].Modules);
    }

    [Fact]
    public async Task Me_tells_the_console_what_the_user_may_do()
    {
        var ct = TestContext.Current.CancellationToken;
        var owner = await api.Client(TestUser.PlatformOwner).GetFromJsonAsync<MeResponse>("/me", Json, ct);
        Assert.True(owner!.CanManageClients);
        Assert.True(owner.CanManageBilling);

        var support = await api.Client(TestUser.PlatformSupport).GetFromJsonAsync<MeResponse>("/me", Json, ct);
        Assert.False(support!.CanManageClients);
        Assert.False(support.CanManageBilling);

        var billing = await api.Client(TestUser.PlatformBilling).GetFromJsonAsync<MeResponse>("/me", Json, ct);
        Assert.False(billing!.CanManageClients);
        Assert.True(billing.CanManageBilling);
    }

    [Fact]
    public async Task Summary_counts_clients_by_state()
    {
        var ct = TestContext.Current.CancellationToken;
        var owner = api.Client(TestUser.PlatformOwner);
        var before = await owner.GetFromJsonAsync<ClientSummary>("/clients/summary", Json, ct);

        var slug = $"sum-{Guid.NewGuid():N}"[..16];
        await owner.PostAsJsonAsync("/clients", new CreateClientRequest("Summary Co", slug, "west-europe", "trial", "Sam", "sam@summary.example"), ct);

        var after = await owner.GetFromJsonAsync<ClientSummary>("/clients/summary", Json, ct);
        Assert.Equal(before!.Trial + 1, after!.Trial);
        Assert.Equal(before.Active, after.Active);
    }

    [Fact]
    public async Task Health_endpoints_need_no_sign_in()
    {
        var response = await api.Client(null).GetAsync("/alive", TestContext.Current.CancellationToken);
        Assert.True(response.IsSuccessStatusCode);
    }
}
