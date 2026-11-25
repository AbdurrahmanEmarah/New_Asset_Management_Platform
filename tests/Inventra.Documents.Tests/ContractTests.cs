using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Inventra.Documents.Tests;

public sealed class ContractTests(DocumentsApi api)
{
    [Fact]
    public async Task The_contract_matches_and_the_model_has_no_pending_changes()
    {
        await api.AssertContractAsync("documents");
        await using var scope = api.Services.CreateAsyncScope();
        Assert.False(scope.ServiceProvider.GetRequiredService<Data.DocumentsDbContext>().Database.HasPendingModelChanges());
    }
}
