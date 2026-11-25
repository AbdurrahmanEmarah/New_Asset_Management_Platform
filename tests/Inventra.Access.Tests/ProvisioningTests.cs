using System.Net;
using Inventra.Access.Api;
using Inventra.Access.Data;
using Inventra.Contracts.Access;
using Inventra.Contracts.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

/// <summary>Tenancy's events arriving in Access, and the seat counts Access sends back.</summary>
public sealed class ProvisioningTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_new_client_gets_the_built_in_roles_an_owner_and_reports_its_seats()
    {
        var company = await api.CreateCompanyAsync();

        var roles = await Read<List<RoleResponse>>(await api.Client(company.Owner).GetAsync("/roles", Ct));
        Assert.Equal("owner,admin,asset_manager,maintenance_planner,technician,storekeeper,requester,viewer",
            string.Join(',', roles.Select(r => r.BuiltInKey)));
        Assert.Equal("owner", roles[0].Kind);
        Assert.Equal(1, roles[0].MemberCount);

        var me = await Read<MeResponse>(await api.Client(company.Owner).GetAsync("/me", Ct));
        Assert.True(me.IsOwner);
        Assert.Equal("owner", Assert.Single(me.Roles).Kind);
        Assert.Equal(18, me.Permissions.Count);

        // Invited (1 seat) when the client was set up, then active after the Owner joined.
        var counted = await api.Events.WaitForAsync<ClientUsersCounted>(c => c.ClientId == company.Id && c.Active == 1);
        Assert.Equal(1, counted.Seats);
        Assert.Equal(0, counted.Invited);

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit", Ct));
        Assert.Contains(audit, a => a.Action == "client.provisioned");
        Assert.Contains(audit, a => a.Action == "user.joined");
    }

    [Fact]
    public async Task Invitation_links_and_tokens_never_reach_the_log()
    {
        var company = await api.CreateCompanyAsync("Quiet Logs Ltd");
        var (_, _) = await api.AddMemberAsync(company, "technician");

        var lines = api.Logs.Lines.Select(l => l.Message).ToList();
        Assert.Contains(lines, m => m.Contains($"Set up client {company.Id} and created Owner invitation", StringComparison.Ordinal));
        Assert.DoesNotContain(lines, m => m.Contains("/join", StringComparison.Ordinal));
        Assert.DoesNotContain(lines, m => m.Contains($"{company.Id:N}.", StringComparison.Ordinal)); // every token starts with the client id
    }

    [Fact]
    public async Task A_repeated_ClientCreated_changes_nothing()
    {
        var company = await api.CreateCompanyAsync();
        await api.DeliverAsync(new ClientCreated(company.Id, "Renamed", "renamed", "business", 25, "Someone Else", "else@example.test", DateTimeOffset.UtcNow));

        var users = await Read<List<UserResponse>>(await api.Client(company.Owner).GetAsync("/users", Ct));
        Assert.Single(users);
        var me = await Read<MeResponse>(await api.Client(company.Owner).GetAsync("/me", Ct));
        Assert.Equal(company.Name, me.Company.Name);
    }

    [Fact]
    public async Task A_suspended_client_cannot_sign_in_until_reactivated()
    {
        var company = await api.CreateCompanyAsync("Paused Co.");
        var at = DateTimeOffset.UtcNow;
        await api.DeliverAsync(new ClientSuspended(company.Id, "Invoice overdue", at));

        var detail = await Problem(await api.Client(company.Owner).GetAsync("/me", Ct), HttpStatusCode.Forbidden);
        Assert.Contains("Paused Co.", detail);
        Assert.Contains("suspended (Invoice overdue)", detail);

        // An older reactivation arriving late is ignored.
        await api.DeliverAsync(new ClientReactivated(company.Id, at.AddMinutes(-5)));
        await Problem(await api.Client(company.Owner).GetAsync("/me", Ct), HttpStatusCode.Forbidden);

        await api.DeliverAsync(new ClientReactivated(company.Id, at.AddMinutes(1)));
        Assert.Equal(HttpStatusCode.OK, (await api.Client(company.Owner).GetAsync("/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_plan_change_moves_the_seat_limit()
    {
        var company = await api.CreateCompanyAsync(maxUsers: 10);
        await api.DeliverAsync(new ClientPlanChanged(company.Id, "starter", 25, DateTimeOffset.UtcNow));
        var seats = await Read<SeatSummary>(await api.Client(company.Owner).GetAsync("/users/summary", Ct));
        Assert.Equal(25, seats.Limit);
        Assert.Equal("ok", seats.State);
    }

    [Fact]
    public async Task An_event_for_an_unknown_client_fails_loudly_so_it_is_retried()
    {
        await Assert.ThrowsAsync<Messaging.ClientNotProvisionedYetException>(() =>
            api.DeliverAsync(new ClientSuspended(Guid.CreateVersion7(), "Too early", DateTimeOffset.UtcNow)));
    }

    [Fact]
    public async Task The_model_has_no_changes_without_a_migration()
    {
        await using var scope = api.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AccessDbContext>();
        Assert.False(db.Database.HasPendingModelChanges(),
            "The Access model changed without a migration. Run: dotnet ef migrations add <Name> --project src/Services/Access/Inventra.Access -o Data/Migrations");
        await Task.CompletedTask;
    }
}
