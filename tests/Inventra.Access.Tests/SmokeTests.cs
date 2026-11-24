using System.Net;
using Inventra.Access.Api;
using Inventra.Testing;

namespace Inventra.Access.Tests;

public sealed class SmokeTests(AccessApi api)
{
    [Fact]
    public async Task A_new_client_gets_an_owner_who_can_sign_in()
    {
        var company = await api.CreateCompanyAsync();
        var me = await AccessApi.Read<MeResponse>(await api.Client(company.Owner).GetAsync("/me", TestContext.Current.CancellationToken));
        Assert.True(me.IsOwner);
        Assert.Equal(company.Id, me.Company.Id);
    }
}
