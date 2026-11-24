using System.Net.Http.Json;
using System.Text.Json;
using Inventra.Contracts.Access;
using Inventra.Contracts.Tenancy;
using Inventra.Tenancy.Api;
using Inventra.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Inventra.Tenancy.Tests;

/// <summary>Stands in for Access: records the events Tenancy publishes.</summary>
public static class ObservedTenancyEvents
{
    public static void Handle(ClientCreated m, PublishedEvents e) => e.Add(m);
    public static void Handle(ClientSuspended m, PublishedEvents e) => e.Add(m);
    public static void Handle(ClientReactivated m, PublishedEvents e) => e.Add(m);
    public static void Handle(ClientPlanChanged m, PublishedEvents e) => e.Add(m);
}

public sealed class MessagingTests(TenancyApi api) : IClassFixture<TenancyApi>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<ClientResponse> CreateAsync(string plan = "starter")
    {
        var slug = $"m-{Guid.NewGuid():N}"[..20];
        var response = await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/clients",
            new CreateClientRequest("Event Co.", slug, "uae-north", plan, "Mona Haddad", "mona@event.example"), Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ClientResponse>(Json, Ct))!;
    }

    [Fact]
    public async Task Client_changes_are_published_through_the_outbox()
    {
        var client = await CreateAsync();
        var created = await api.Events.WaitForAsync<ClientCreated>(e => e.ClientId == client.Id);
        Assert.Equal(("Event Co.", 25, "mona@event.example"), (created.Name, created.MaxUsers, created.OwnerEmail));

        (await api.Client(TestUser.PlatformOwner).PostAsJsonAsync($"/clients/{client.Id}/suspend", new SuspendClientRequest("Unpaid invoice"), Ct)).EnsureSuccessStatusCode();
        Assert.Equal("Unpaid invoice", (await api.Events.WaitForAsync<ClientSuspended>(e => e.ClientId == client.Id)).Reason);

        (await api.Client(TestUser.PlatformOwner).PostAsync($"/clients/{client.Id}/reactivate", null, Ct)).EnsureSuccessStatusCode();
        await api.Events.WaitForAsync<ClientReactivated>(e => e.ClientId == client.Id);

        (await api.Client(TestUser.PlatformOwner).PutAsJsonAsync($"/clients/{client.Id}/plan", new ChangePlanRequest("business"), Ct)).EnsureSuccessStatusCode();
        Assert.Equal(200, (await api.Events.WaitForAsync<ClientPlanChanged>(e => e.ClientId == client.Id)).MaxUsers);
    }

    [Fact]
    public async Task Seat_counts_from_Access_fill_the_usage_bar_and_older_ones_are_ignored()
    {
        var client = await CreateAsync();
        var at = DateTimeOffset.UtcNow;
        await api.DeliverAsync(new ClientUsersCounted(client.Id, 21, 20, 1, at));
        await api.DeliverAsync(new ClientUsersCounted(client.Id, 3, 3, 0, at.AddMinutes(-1)));

        var fresh = await api.Client(TestUser.PlatformOwner).GetFromJsonAsync<ClientResponse>($"/clients/{client.Id}", Json, Ct);
        Assert.Equal(new UsageLine(21, 25, "warn"), fresh!.Usage.Users);
    }

    [Fact]
    public async Task Platform_activity_from_Access_lands_in_the_platform_audit_log()
    {
        var client = await CreateAsync();
        await api.DeliverAsync(new PlatformActivityRecorded("support-1", "Support Agent", "support.pass_started", client.Id, "Read-only access for 30 minutes.", DateTimeOffset.UtcNow));
        var audit = await api.Client(TestUser.PlatformOwner).GetFromJsonAsync<List<AuditEntryResponse>>($"/audit?clientId={client.Id}", Json, Ct);
        Assert.Contains(audit!, a => a.Action == "support.pass_started" && a.ActorName == "Support Agent" && a.ClientName == "Event Co.");
    }

    [Fact]
    public async Task The_model_has_no_changes_without_a_migration()
    {
        await using var scope = api.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<Data.TenancyDbContext>();
        Assert.False(Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions.HasPendingModelChanges(db.Database));
    }
}
