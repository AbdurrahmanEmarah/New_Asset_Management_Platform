using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventra.Tenancy.Data;

/// <summary>Lets "dotnet ef migrations add" run without starting the service.</summary>
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<TenancyDbContext>
{
    public TenancyDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<TenancyDbContext>()
            .UseNpgsql("Host=localhost;Database=tenancy_design")
            .UseSnakeCaseNamingConvention()
            .Options);
}
