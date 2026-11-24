using Inventra.Tenancy.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Tenancy.Data;

public sealed class TenancyDbContext(DbContextOptions<TenancyDbContext> options) : DbContext(options)
{
    public const string SlugIndex = "ix_clients_slug";

    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<PlatformAuditEntry> AuditEntries => Set<PlatformAuditEntry>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Plan>(e =>
        {
            e.ToTable("plans");
            e.HasKey(p => p.Key);
            e.Property(p => p.Key).HasMaxLength(32);
            e.Property(p => p.Name).HasMaxLength(64);
            e.HasData(PlanCatalog.Defaults);
        });

        model.Entity<Client>(e =>
        {
            e.ToTable("clients");
            e.HasKey(c => c.Id);
            e.Property(c => c.Name).HasMaxLength(120);
            e.Property(c => c.Slug).HasMaxLength(Slug.MaxLength);
            e.HasIndex(c => c.Slug).IsUnique().HasDatabaseName(SlugIndex);
            e.Property(c => c.Region).HasMaxLength(32);
            e.Property(c => c.PlanKey).HasMaxLength(32);
            e.HasOne<Plan>().WithMany().HasForeignKey(c => c.PlanKey).OnDelete(DeleteBehavior.Restrict);
            e.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(c => c.OwnerName).HasMaxLength(120);
            e.Property(c => c.OwnerEmail).HasMaxLength(254);
            e.Property(c => c.SuspendedReason).HasMaxLength(500);
            e.Property<uint>("Version").IsRowVersion(); // maps to PostgreSQL's xmin system column
        });

        model.Entity<PlatformAuditEntry>(e =>
        {
            e.ToTable("platform_audit");
            e.HasKey(a => a.Id);
            e.Property(a => a.Id).UseIdentityAlwaysColumn();
            e.Property(a => a.ActorId).HasMaxLength(64);
            e.Property(a => a.ActorName).HasMaxLength(200);
            e.Property(a => a.Action).HasMaxLength(64);
            e.Property(a => a.ClientName).HasMaxLength(120);
            e.Property(a => a.Details).HasMaxLength(2000);
            e.HasIndex(a => new { a.ClientId, a.At });
            e.HasIndex(a => a.At);
        });
    }
}
