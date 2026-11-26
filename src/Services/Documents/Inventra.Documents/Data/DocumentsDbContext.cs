using Inventra.Documents.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Documents.Data;

/// <summary>Documents' database. Every table has tenant_id and a forced row-level security policy.</summary>
public sealed class DocumentsDbContext(DbContextOptions<DocumentsDbContext> options) : DbContext(options)
{
    public static readonly string[] TenantTables = ["documents", "storage_limits"];

    public DbSet<Document> Documents => Set<Document>();
    public DbSet<StorageLimit> Limits => Set<StorageLimit>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Document>(e =>
        {
            e.ToTable("documents");
            e.HasKey(d => d.Id);
            e.Property(d => d.FileName).HasMaxLength(Document.FileNameMax);
            e.Property(d => d.ContentType).HasMaxLength(64);
            e.Property(d => d.BlobName).HasMaxLength(120);
            e.Property(d => d.UploadedById).HasMaxLength(255);
            e.Property(d => d.UploadedByName).HasMaxLength(200);
            e.HasIndex(d => new { d.TenantId, d.AssetId });
        });

        model.Entity<StorageLimit>(e =>
        {
            e.ToTable("storage_limits");
            e.HasKey(l => l.TenantId);
        });
    }
}
