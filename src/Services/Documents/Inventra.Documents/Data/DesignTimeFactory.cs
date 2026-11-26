using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventra.Documents.Data;

/// <summary>Lets "dotnet ef migrations add" run without starting the service.</summary>
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<DocumentsDbContext>
{
    public DocumentsDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<DocumentsDbContext>()
            .UseNpgsql("Host=localhost;Database=documents_design")
            .UseSnakeCaseNamingConvention()
            .Options);
}
