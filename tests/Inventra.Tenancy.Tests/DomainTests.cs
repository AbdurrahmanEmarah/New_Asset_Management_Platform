using Inventra.Tenancy.Api;
using Inventra.Tenancy.Domain;

namespace Inventra.Tenancy.Tests;

public sealed class DomainTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 9, 0, 0, TimeSpan.Zero);
    private static Plan PlanOf(string key) => PlanCatalog.Defaults.Single(p => p.Key == key);

    [Theory]
    [InlineData("gulf-fm", null)]
    [InlineData("abc", null)]
    [InlineData("a1-b2-c3", null)]
    [InlineData("", "required")]
    [InlineData("GULF", "lowercase")]
    [InlineData("gulf_fm", "lowercase")]
    [InlineData("gulf-", "lowercase")]
    [InlineData("support", "reserved")]
    public void Slug_rules(string slug, string? problemContains)
    {
        var problem = Slug.Problem(slug);
        if (problemContains is null) Assert.Null(problem);
        else Assert.Contains(problemContains, problem);
    }

    [Theory]
    [InlineData(0, 10, "ok")]
    [InlineData(7, 10, "ok")]
    [InlineData(8, 10, "warn")]
    [InlineData(10, 10, "blocked")]
    [InlineData(12, 10, "blocked")]
    public void Usage_turns_amber_at_80_percent_and_blocks_at_100(long used, long limit, string state) =>
        Assert.Equal(state, UsageLine.Of(used, limit).State);

    [Fact]
    public void A_plan_change_that_would_go_below_current_usage_is_explained()
    {
        var client = Client.Create("Delta Schools", "delta", "west-europe", PlanOf("business"), "Lina", "lina@delta.example", Now);
        client.SetUsage(users: 40, assets: 100, storageMb: 0);

        var why = client.CannotChangePlanReason(PlanOf("starter"));
        Assert.Equal("Delta Schools has 40 users but Starter allows 25. Ask them to remove users first.", why);
        Assert.Null(client.CannotChangePlanReason(PlanOf("enterprise")));
    }

    [Fact]
    public void Reactivating_a_trial_client_after_the_trial_ended_makes_it_active()
    {
        var client = Client.Create("Coastline", "coastline", "uae-north", PlanOf("trial"), "Ali", "ali@coast.example", Now);
        client.Suspend("Testing", Now);
        client.Reactivate(PlanOf("trial"), Now.AddDays(30));
        Assert.Equal(ClientStatus.Active, client.Status);
    }

    [Fact]
    public void Owner_email_is_stored_lowercase()
    {
        var client = Client.Create(" Metro ", "metro", "uae-north", PlanOf("starter"), " Dina ", " Dina@Metro.Example ", Now);
        Assert.Equal("Metro", client.Name);
        Assert.Equal("dina@metro.example", client.OwnerEmail);
    }
}
