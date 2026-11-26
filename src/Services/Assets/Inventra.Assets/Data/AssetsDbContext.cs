using Inventra.Assets.Domain;
using Inventra.BuildingBlocks.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Inventra.Assets.Data;

/// <summary>Assets' database. Every table has tenant_id and a forced row-level security policy.</summary>
public sealed class AssetsDbContext(DbContextOptions<AssetsDbContext> options) : DbContext(options)
{
    public const string TagIndex = "ix_assets_tenant_id_tag";
    public static readonly string[] TenantTables = ["assets", "asset_types", "client_limits", "sites", "tag_counters"];

    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetTypeCopy> Types => Set<AssetTypeCopy>();
    public DbSet<ClientLimit> Limits => Set<ClientLimit>();
    public DbSet<SiteCopy> Sites => Set<SiteCopy>();
    public DbSet<TagCounter> TagCounters => Set<TagCounter>();

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

        model.Entity<TagCounter>(e =>
        {
            e.ToTable("tag_counters");
            e.HasKey(c => c.TypeId);
            e.HasIndex(c => c.TenantId);
        });

        model.Entity<SiteCopy>(e =>
        {
            e.ToTable("sites");
            e.HasKey(s => s.SiteId);
            e.Property(s => s.Name).HasMaxLength(120);
            e.Property(s => s.Code).HasMaxLength(16);
            e.HasIndex(s => s.TenantId);
        });

        model.Entity<ClientLimit>(e =>
        {
            e.ToTable("client_limits");
            e.HasKey(l => l.TenantId);
        });
    }

    /// <summary>
    /// Takes the next tag number for a type, atomically. Must run inside the transaction that inserts
    /// the asset: the counter row stays locked until that transaction ends, so parallel creates of the
    /// same type wait in turn, and a rolled-back create gives its number back. The first number of a
    /// type continues after its highest existing tag (types from before the counter existed).
    /// </summary>
    public async Task<int> TakeTagNumberAsync(Guid tenantId, Guid typeId, CancellationToken ct)
    {
        var connection = Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.Transaction = Database.CurrentTransaction?.GetDbTransaction()
            ?? throw new InvalidOperationException("Take a tag number inside the transaction that saves the asset.");
        command.CommandText = """
            INSERT INTO tag_counters (type_id, tenant_id, next_number)
            VALUES (@type, @tenant, (SELECT COALESCE(MAX(substring(tag FROM '([0-9]+)$')::int), 0) + 2 FROM assets WHERE type_id = @type))
            ON CONFLICT (type_id) DO UPDATE SET next_number = tag_counters.next_number + 1
            RETURNING next_number - 1
            """;
        command.Parameters.Add(new Npgsql.NpgsqlParameter("type", typeId));
        command.Parameters.Add(new Npgsql.NpgsqlParameter("tenant", tenantId));
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct), System.Globalization.CultureInfo.InvariantCulture);
    }
}
