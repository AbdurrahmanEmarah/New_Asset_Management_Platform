using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using Inventra.Access.Domain;
using Inventra.Contracts.Access;
using Inventra.Testing;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class SupportPassTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<StartedSupportPassResponse> StartAsync(Company c, TestUser staff, string access = "read") =>
        await Read<StartedSupportPassResponse>(await api.Client(staff).PostAsJsonAsync($"/platform/clients/{c.Id}/support-passes",
            new StartSupportPassRequest("Customer reported login trouble", 30, access), Ct));

    [Fact]
    public async Task A_read_only_pass_can_look_but_not_change_and_every_request_is_audited()
    {
        var company = await api.CreateCompanyAsync();
        var started = await StartAsync(company, TestUser.PlatformSupport);
        Assert.Equal("X-Support-Pass", started.HeaderName);
        Assert.Equal(SupportAccess.Read, started.Pass.Access);
        await api.Events.WaitForAsync<PlatformActivityRecorded>(e => e.ClientId == company.Id && e.Action == "support.pass_started");

        var support = api.SupportClient(TestUser.PlatformSupport, started.HeaderValue);
        var me = await Read<MeResponse>(await support.GetAsync("/me", Ct));
        Assert.Null(me.UserId);
        Assert.Equal(started.Pass.Id, me.SupportSession!.PassId);
        Assert.Single(await Read<List<UserResponse>>(await support.GetAsync("/users", Ct)));
        Assert.Contains("read-only", await Problem(await support.PostAsJsonAsync("/sites", new SiteRequest("X", "X", null), Ct), HttpStatusCode.Forbidden));

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync($"/audit?supportPassId={started.Pass.Id}", Ct));
        Assert.Contains(audit, a => a.Action == "support.request" && a.Details == "GET /users" && a.ActorKind == ActorKind.Support);
        Assert.Contains(audit, a => a.Action == "support.request" && a.Details == "POST /sites (refused: read-only pass)");
        Assert.Contains(audit, a => a.Action == "support.pass_started" && a.ActorKind == ActorKind.Platform);

        var passes = await Read<List<SupportPassResponse>>(await api.Client(company.Owner).GetAsync("/support-passes", Ct));
        var pass = Assert.Single(passes);
        Assert.Equal(SupportPassStatus.Active, pass.Status);
        Assert.Equal(3, pass.ActionCount);
    }

    [Fact]
    public async Task The_client_can_end_a_pass_and_it_stops_working()
    {
        var company = await api.CreateCompanyAsync();
        var started = await StartAsync(company, TestUser.PlatformSupport);
        var ended = await Read<SupportPassResponse>(await api.Client(company.Owner).PostAsync($"/support-passes/{started.Pass.Id}/end", null, Ct));
        Assert.Equal(SupportPassStatus.Ended, ended.Status);
        Assert.Contains("ended by Mona Haddad",
            await Problem(await api.SupportClient(TestUser.PlatformSupport, started.HeaderValue).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("already ended", await Problem(await api.Client(company.Owner).PostAsync($"/support-passes/{started.Pass.Id}/end", null, Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Change_access_is_for_the_platform_owner_and_passes_are_personal()
    {
        var company = await api.CreateCompanyAsync();
        Assert.Contains("Only the Platform Owner", await Problem(await api.Client(TestUser.PlatformSupport).PostAsJsonAsync($"/platform/clients/{company.Id}/support-passes",
            new StartSupportPassRequest("Customer asked us to fix a role", 30, "change"), Ct), HttpStatusCode.Forbidden));
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(TestUser.PlatformBilling).PostAsJsonAsync($"/platform/clients/{company.Id}/support-passes",
            new StartSupportPassRequest("Billing wants to look around", 30, "read"), Ct)).StatusCode);

        var started = await StartAsync(company, TestUser.PlatformOwner, "change");
        var owner = api.SupportClient(TestUser.PlatformOwner, started.HeaderValue);
        await Read<SiteResponse>(await owner.PostAsJsonAsync("/sites", new SiteRequest("Fixed by support", "SUP", null), Ct));
        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit?take=5", Ct));
        Assert.Contains(audit, a => a.Action == "site.created" && a.ActorName == "Platform Owner (Inventra support)" && a.SupportPassId == started.Pass.Id);

        Assert.Contains("belongs to someone else",
            await Problem(await api.SupportClient(TestUser.PlatformSupport, started.HeaderValue).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("already have a support pass", await Problem(await api.Client(TestUser.PlatformOwner).PostAsJsonAsync($"/platform/clients/{company.Id}/support-passes",
            new StartSupportPassRequest("Second pass for the same", 30, "read"), Ct), HttpStatusCode.Conflict));

        await Read<SupportPassResponse>(await api.Client(TestUser.PlatformOwner).PostAsync($"/platform/clients/{company.Id}/support-passes/{started.Pass.Id}/end", null, Ct));
        var list = await Read<List<SupportPassResponse>>(await api.Client(TestUser.PlatformSupport).GetAsync($"/platform/clients/{company.Id}/support-passes", Ct));
        Assert.Equal(SupportPassStatus.Ended, Assert.Single(list).Status);
    }

    [Fact]
    public async Task Requests_are_validated_and_a_pass_only_opens_its_own_client()
    {
        var company = await api.CreateCompanyAsync();
        var other = await api.CreateCompanyAsync("Other Co.");
        var errors = await FieldErrors(await api.Client(TestUser.PlatformSupport).PostAsJsonAsync($"/platform/clients/{company.Id}/support-passes",
            new StartSupportPassRequest("short", 5, "everything"), Ct));
        Assert.Equal(["access", "minutes", "reason"], errors.Keys.Order().ToArray());

        var started = await StartAsync(company, TestUser.PlatformSupport);
        var forged = $"{other.Id:N}.{started.Pass.Id:N}";
        Assert.Contains("doesn't exist for that client",
            await Problem(await api.SupportClient(TestUser.PlatformSupport, forged).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("isn't a valid support pass",
            await Problem(await api.SupportClient(TestUser.PlatformSupport, "garbage").GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(company.Owner).GetAsync($"/platform/clients/{company.Id}/support-passes", Ct)).StatusCode);
    }

    [Fact]
    public async Task The_platform_owner_reissues_the_owner_invitation_until_the_owner_joins()
    {
        var id = Guid.CreateVersion7();
        await api.DeliverAsync(new Contracts.Tenancy.ClientCreated(id, "Fresh Co.", "fresh", "trial", 10, "Ola", $"ola-{id:N}@example.test", DateTimeOffset.UtcNow));
        var status = await Read<OwnerInvitationResponse>(await api.Client(TestUser.PlatformSupport).GetAsync($"/platform/clients/{id}/owner-invitation", Ct));
        Assert.Equal(UserStatus.Invited, status.Status);
        Assert.Null(status.AcceptUrl);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(TestUser.PlatformSupport).PostAsync($"/platform/clients/{id}/owner-invitation", null, Ct)).StatusCode);

        var link = await Read<OwnerInvitationResponse>(await api.Client(TestUser.PlatformOwner).PostAsync($"/platform/clients/{id}/owner-invitation", null, Ct));
        Assert.StartsWith("https://app.example.test/join#", link.AcceptUrl);
        await api.Events.WaitForAsync<PlatformActivityRecorded>(e => e.ClientId == id && e.Action == "client.owner_invitation_reissued");
        Assert.Contains("hasn't set up this client", await Problem(await api.Client(TestUser.PlatformOwner).GetAsync($"/platform/clients/{Guid.NewGuid()}/owner-invitation", Ct), HttpStatusCode.NotFound));
    }
}
