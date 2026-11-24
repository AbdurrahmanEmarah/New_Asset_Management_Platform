using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class SiteAndAuditTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Sites_are_managed_by_settings_admins_and_readable_by_everyone()
    {
        var company = await api.CreateCompanyAsync();
        var owner = api.Client(company.Owner);
        var errors = await FieldErrors(await owner.PostAsJsonAsync("/sites", new SiteRequest("", "bad code!", null), Ct));
        Assert.Equal("Site name is required.", errors["name"][0]);
        Assert.Contains("letters, numbers and dashes", errors["code"][0]);

        var site = await Read<SiteResponse>(await owner.PostAsJsonAsync("/sites", new SiteRequest("HQ Tower", "hq", null), Ct));
        Assert.Equal("HQ", site.Code);
        Assert.Contains("already uses the code HQ", (await FieldErrors(await owner.PostAsJsonAsync("/sites", new SiteRequest("Other", "HQ", null), Ct)))["code"][0]);

        var updated = await Read<SiteResponse>(await owner.PutAsJsonAsync($"/sites/{site.Id}", new SiteRequest("HQ Tower A", "HQ-A", false), Ct));
        Assert.False(updated.IsActive);

        var (tech, _) = await api.AddMemberAsync(company, "technician");
        Assert.Single(await Read<List<SiteResponse>>(await api.Client(tech).GetAsync("/sites", Ct)));
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(tech).PostAsJsonAsync("/sites", new SiteRequest("X", "X", null), Ct)).StatusCode);
    }

    [Fact]
    public async Task The_audit_log_pages_newest_first_and_needs_the_permission()
    {
        var company = await api.CreateCompanyAsync();
        for (var i = 0; i < 3; i++)
            await Read<SiteResponse>(await api.Client(company.Owner).PostAsJsonAsync("/sites", new SiteRequest($"Site {i}", $"S{i}", null), Ct));

        var page = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit?take=2", Ct));
        Assert.Equal(2, page.Count);
        Assert.True(page[0].Id > page[1].Id);
        var next = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync($"/audit?take=2&before={page[1].Id}", Ct));
        Assert.All(next, e => Assert.True(e.Id < page[1].Id));

        var (viewer, _) = await api.AddMemberAsync(company, "viewer");
        Assert.Equal(HttpStatusCode.OK, (await api.Client(viewer).GetAsync("/audit", Ct)).StatusCode);
        var (tech, _) = await api.AddMemberAsync(company, "technician");
        Assert.Contains("\"View the audit log\"", await Problem(await api.Client(tech).GetAsync("/audit", Ct), HttpStatusCode.Forbidden));
    }
}
