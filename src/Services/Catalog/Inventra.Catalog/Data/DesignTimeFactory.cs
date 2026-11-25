using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventra.Catalog.Data;

/// <summary>Lets "dotnet ef migrations add" run without starting the service.</summary>
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<CatalogDbContext>()
            .UseNpgsql("Host=localhost;Database=catalog_design")
            .UseSnakeCaseNamingConvention()
            .Options);
}
