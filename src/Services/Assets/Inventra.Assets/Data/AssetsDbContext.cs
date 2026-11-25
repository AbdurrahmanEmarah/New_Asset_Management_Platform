using Inventra.Assets.Domain;
using Inventra.BuildingBlocks.Data;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Assets.Data;

/// <summary>Assets' database. Every table has tenant_id and a forced row-level security policy.</summary>
public sealed class AssetsDbContext(DbContextOptions<AssetsDbContext> options) : DbContext(options)
{
    public const string TagIndex = "ix_assets_tenant_id_tag";
    public static readonly string[] TenantTables = ["assets", "asset_types", "client_limits"];

    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetTypeCopy> Types => Set<AssetTypeCopy>();
    public DbSet<ClientLimit> Limits => Set<ClientLimit>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Asset>(e =>
        {
            e.ToTable("assets");
            e.HasKey(a => a.Id);
            e.Property(a => a.Tag).HasMaxLength(20);
            e.Property(a => a.Name).HasMaxLength(Asset.NameMax);
            e.Property(a => a.StatusKey).HasMaxLength(40);
            e.Property(a => a.Location).HasMaxLength(Asset.LocationMax);
            e.Property(a => a.RetiredReason).HasMaxLength(500);
            e.Property(a => a.Values).HasColumnType("jsonb");
            e.HasIndex(a => new { a.TenantId, a.Tag }).IsUnique().HasDatabaseName(TagIndex);
            e.HasIndex(a => new { a.TenantId, a.TypeId });
            e.HasIndex(a => new { a.TenantId, a.SiteId });
            e.HasIndex(a => new { a.TenantId, a.ParentId });
            e.HasOne<AssetTypeCopy>().WithMany().HasForeignKey(a => a.TypeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Asset>().WithMany().HasForeignKey(a => a.ParentId).OnDelete(DeleteBehavior.Restrict);
            e.Property<uint>("RowVersion").IsRowVersion();
        });

        model.Entity<AssetTypeCopy>(e =>
        {
            e.ToTable("asset_types");
            e.HasKey(t => t.TypeId);
            e.Property(t => t.Name).HasMaxLength(80);
            e.Property(t => t.TagPrefix).HasMaxLength(8);
            e.Property(t => t.IconKey).HasMaxLength(32);
            e.Property(t => t.Fields).HasJsonConversion();
            e.Property(t => t.Statuses).HasJsonConversion();
            e.HasIndex(t => t.TenantId);
            e.Property<uint>("RowVersion").IsRowVersion();
        });

        model.Entity<ClientLimit>(e =>
        {
            e.ToTable("client_limits");
            e.HasKey(l => l.TenantId);
        });
    }
}
