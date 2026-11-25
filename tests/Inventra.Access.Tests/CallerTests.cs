using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using Inventra.Contracts.Access;
using Inventra.Contracts.Shared;
using Inventra.Testing;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

/// <summary>What other client services learn about the caller, and how their activity reaches the audit log.</summary>
public sealed class CallerTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Members_get_their_permissions_and_assignment_sites()
    {
        var company = await api.CreateCompanyAsync();
        var hq = await Read<SiteResponse>(await api.Client(company.Owner).PostAsJsonAsync("/sites", new SiteRequest("HQ", "HQ", null), Ct));
        var roles = await Read<List<RoleResponse>>(await api.Client(company.Owner).GetAsync("/roles", Ct));
        var (tech, techId) = await api.AddMemberWithRolesAsync(company, [new(roles.Single(r => r.BuiltInKey == "technician").Id, [hq.Id])]);

        var info = await Read<CallerInfo>(await api.Client(tech).GetAsync("/internal/caller", Ct));
        Assert.Equal((company.Id, "user", techId, false, false), (info.ClientId, info.ActorKind, info.UserId!.Value, info.IsOwner, info.ReadOnly));
        Assert.Contains("assets.read", info.Permissions);
        Assert.Equal([hq.Id], Assert.Single(info.Grants).SiteIds);

        var owner = await Read<CallerInfo>(await api.Client(company.Owner).GetAsync("/internal/caller", Ct));
        Assert.True(owner.IsOwner);
        Assert.Equal(PermissionNames.Labels.Count, owner.Permissions.Count);
        Assert.Contains("isn't linked to a company", await Problem(await api.Client(TestUser.Tenant(null, "x", "X", "x@example.test")).GetAsync("/internal/caller", Ct), HttpStatusCode.Forbidden));
    }

    [Fact]
    public async Task Support_passes_are_described_but_the_lookup_itself_is_not_audited()
    {
        var company = await api.CreateCompanyAsync();
        var started = await Read<StartedSupportPassResponse>(await api.Client(TestUser.PlatformSupport).PostAsJsonAsync(
            $"/platform/clients/{company.Id}/support-passes", new StartSupportPassRequest("Checking the asset register", 30, "read"), Ct));
        var info = await Read<CallerInfo>(await api.SupportClient(TestUser.PlatformSupport, started.HeaderValue).GetAsync("/internal/caller", Ct));
        Assert.Equal(("support", started.Pass.Id, true), (info.ActorKind, info.SupportPassId!.Value, info.ReadOnly));

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync($"/audit?supportPassId={started.Pass.Id}", Ct));
        Assert.DoesNotContain(audit, a => a.Details.Contains("/internal/caller"));
    }

    [Fact]
    public async Task Activity_from_other_services_lands_in_the_clients_audit_log()
    {
        var company = await api.CreateCompanyAsync();
        var target = Guid.NewGuid();
        await api.DeliverAsync(new ClientActivityRecorded(company.Id, "assets", "u1", "Max Manager", "user", "asset.created", "asset", target,
            "Added PMP-000001 Pump.", null, DateTimeOffset.UtcNow));
        await api.DeliverAsync(new ClientActivityRecorded(company.Id, "catalog", "s1", "Sam (Inventra support)", "support", "support.request", "support_pass", null,
            "catalog: GET /types", Guid.NewGuid(), DateTimeOffset.UtcNow));

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit", Ct));
        Assert.Contains(audit, a => a.Action == "asset.created" && a.TargetId == target && a.ActorName == "Max Manager");
        Assert.Contains(audit, a => a.Action == "support.request" && a.ActorKind == Domain.ActorKind.Support);
        var other = await api.CreateCompanyAsync("Other Co.");
        Assert.DoesNotContain(await Read<List<AuditEntryResponse>>(await api.Client(other.Owner).GetAsync("/audit", Ct)), a => a.TargetId == target);
    }

    [Fact]
    public void Permission_labels_shared_with_other_services_match_the_catalog()
    {
        var catalog = Domain.Permissions.Catalog.SelectMany(a => a.Permissions).ToDictionary(p => p.Key, p => p.Label);
        Assert.Equal(catalog.OrderBy(kv => kv.Key), PermissionNames.Labels.OrderBy(kv => kv.Key));
    }
}
