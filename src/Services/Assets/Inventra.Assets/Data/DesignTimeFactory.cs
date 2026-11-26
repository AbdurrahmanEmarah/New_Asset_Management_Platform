using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventra.Assets.Data;

/// <summary>Lets "dotnet ef migrations add" run without starting the service.</summary>
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AssetsDbContext>
{
    public AssetsDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<AssetsDbContext>()
            .UseNpgsql("Host=localhost;Database=assets_design")
            .UseSnakeCaseNamingConvention()
            .Options);
}
