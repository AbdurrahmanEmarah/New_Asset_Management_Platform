using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventra.Access.Data;

/// <summary>Lets "dotnet ef migrations add" run without starting the service.</summary>
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AccessDbContext>
{
    public AccessDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<AccessDbContext>()
            .UseNpgsql("Host=localhost;Database=access_design")
            .UseSnakeCaseNamingConvention()
            .Options);
}
