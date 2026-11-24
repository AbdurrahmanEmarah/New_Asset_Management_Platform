using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using Inventra.Testing;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class MeTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Theme_is_saved_on_the_profile()
    {
        var company = await api.CreateCompanyAsync();
        var me = await Read<MeResponse>(await api.Client(company.Owner).PutAsJsonAsync("/me/preferences", new PreferencesRequest("dark"), Ct));
        Assert.Equal(Domain.ThemePreference.Dark, me.Theme);
        me = await Read<MeResponse>(await api.Client(company.Owner).GetAsync("/me", Ct));
        Assert.Equal(Domain.ThemePreference.Dark, me.Theme);

        var errors = await FieldErrors(await api.Client(company.Owner).PutAsJsonAsync("/me/preferences", new PreferencesRequest("purple"), Ct));
        Assert.Equal("Choose system, light or dark.", errors["theme"][0]);
    }

    [Fact]
    public async Task People_who_may_not_use_the_app_get_a_reason()
    {
        var company = await api.CreateCompanyAsync("Reasons Ltd");
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.Client(null).GetAsync("/me", Ct)).StatusCode);
        Assert.Contains("isn't linked to a company",
            await Problem(await api.Client(TestUser.Tenant(null, "nobody", "Nobody", "n@example.test")).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("not a member of Reasons Ltd",
            await Problem(await api.Client(TestUser.Tenant(company.Id, "stranger", "Stranger", "s@example.test")).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("without a support pass",
            await Problem(await api.Client(TestUser.PlatformOwner).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("isn't set up in Inventra yet",
            await Problem(await api.Client(TestUser.Tenant(Guid.NewGuid(), "early", "Early", "e@example.test")).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
    }

    [Fact]
    public async Task The_catalog_lists_every_permission_by_area()
    {
        var company = await api.CreateCompanyAsync();
        var (tech, _) = await api.AddMemberAsync(company, "technician");
        var areas = await Read<List<PermissionAreaResponse>>(await api.Client(tech).GetAsync("/permissions", Ct));
        Assert.Equal(6, areas.Count);
        Assert.Contains(areas.SelectMany(a => a.Permissions), p => p.Key == "assets.dispose" && p.Label == "Retire or dispose");
    }
}
