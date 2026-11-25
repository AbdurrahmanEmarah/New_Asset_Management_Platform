using Inventra.BuildingBlocks.Data;
using Inventra.Catalog.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Catalog.Data;

/// <summary>
/// Catalog's database. asset_types holds client data (tenant_id, row-level security). templates is the
/// platform's shared library: no client data, readable by everyone, changed only by the Platform Owner.
/// </summary>
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public const string PrefixIndex = "ix_asset_types_tenant_id_tag_prefix";
    public const string NameIndex = "ix_asset_types_tenant_id_name";

    public static readonly string[] TenantTables = ["asset_types"];
    public static readonly string[] SharedTables = ["templates"];

    public DbSet<AssetType> Types => Set<AssetType>();
    public DbSet<AssetTemplate> Templates => Set<AssetTemplate>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<AssetType>(e =>
        {
            e.ToTable("asset_types");
            e.HasKey(t => t.Id);
            e.Property(t => t.Name).HasMaxLength(AssetType.NameMax);
            e.Property(t => t.TagPrefix).HasMaxLength(8);
            e.Property(t => t.IconKey).HasMaxLength(32);
            e.Property(t => t.TemplateKey).HasMaxLength(40);
            e.Property(t => t.Fields).HasJsonConversion();
            e.Property(t => t.Statuses).HasJsonConversion();
            e.HasIndex(t => new { t.TenantId, t.TagPrefix }).IsUnique().HasDatabaseName(PrefixIndex);
            e.HasIndex(t => new { t.TenantId, t.Name }).IsUnique().HasDatabaseName(NameIndex);
            e.Property<uint>("RowVersion").IsRowVersion();
        });

        model.Entity<AssetTemplate>(e =>
        {
            e.ToTable("templates");
            e.HasKey(t => t.Key);
            e.Property(t => t.Key).HasMaxLength(40);
            e.Property(t => t.Name).HasMaxLength(AssetType.NameMax);
            e.Property(t => t.Description).HasMaxLength(300);
            e.Property(t => t.Category).HasMaxLength(60);
            e.Property(t => t.TagPrefix).HasMaxLength(8);
            e.Property(t => t.IconKey).HasMaxLength(32);
            e.Property(t => t.Fields).HasJsonConversion();
            e.Property(t => t.Statuses).HasJsonConversion();
            e.HasData(TemplateLibrary.Defaults);
        });
    }
}
