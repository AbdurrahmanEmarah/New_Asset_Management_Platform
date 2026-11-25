using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Inventra.Assets.Tests;

public sealed class ContractTests(AssetsApi api)
{
    [Fact]
    public async Task The_contract_matches_and_the_model_has_no_pending_changes()
    {
        await api.AssertContractAsync("assets");
        await using var scope = api.Services.CreateAsyncScope();
        Assert.False(scope.ServiceProvider.GetRequiredService<Data.AssetsDbContext>().Database.HasPendingModelChanges());
    }
}

public sealed class RowSecurityTests(AssetsApi api)
{
    [Fact]
    public Task Every_table_has_a_forced_tenant_policy() => api.AssertRowSecurityAsync(Data.AssetsDbContext.TenantTables);
}
