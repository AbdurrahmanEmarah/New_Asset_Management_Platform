using Inventra.Access.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Access.Data;

/// <summary>
/// Access's database. Every table has tenant_id and a forced row-level security policy (see the
/// Initial migration), so each connection only sees the client set in <see cref="Inventra.BuildingBlocks.Data.ITenantContext"/>.
/// </summary>
public sealed class AccessDbContext(DbContextOptions<AccessDbContext> options) : DbContext(options)
{
    public const string UserEmailIndex = "ix_users_tenant_id_email";
    public const string UserSubjectIndex = "ix_users_tenant_id_subject";
    public const string RoleNameIndex = "ix_roles_tenant_id_normalized_name";
    public const string SiteCodeIndex = "ix_sites_tenant_id_code";

    /// <summary>Every table, for the row-level security migration and the test that checks it.</summary>
    public static readonly string[] TenantTables =
        ["client_accounts", "users", "roles", "user_roles", "invitations", "sites", "support_passes", "audit_entries"];

    public DbSet<ClientAccount> Clients => Set<ClientAccount>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<SupportPass> SupportPasses => Set<SupportPass>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<ClientAccount>(e =>
        {
            e.ToTable("client_accounts");
            e.HasKey(c => c.TenantId);
            e.Property(c => c.Name).HasMaxLength(120);
            e.Property(c => c.Slug).HasMaxLength(32);
            e.Property(c => c.PlanKey).HasMaxLength(32);
            e.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(c => c.SuspendedReason).HasMaxLength(500);
            e.Property<uint>("Version").IsRowVersion();
        });

        model.Entity<AppUser>(e =>
        {
            e.ToTable("users");
            e.HasKey(u => u.Id);
            e.Property(u => u.Email).HasMaxLength(254);
            e.Property(u => u.Name).HasMaxLength(AppUser.NameMax);
            e.Property(u => u.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(u => u.Subject).HasMaxLength(255);
            e.Property(u => u.Theme).HasConversion<string>().HasMaxLength(16);
            e.Property(u => u.InvitedByName).HasMaxLength(200);
            e.Property(u => u.DeactivatedByName).HasMaxLength(200);
            e.HasIndex(u => new { u.TenantId, u.Email }).IsUnique().HasDatabaseName(UserEmailIndex);
            e.HasIndex(u => new { u.TenantId, u.Subject }).IsUnique().HasDatabaseName(UserSubjectIndex).HasFilter("subject IS NOT NULL");
            e.HasOne<ClientAccount>().WithMany().HasForeignKey(u => u.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(u => u.Roles).WithOne().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
            e.Navigation(u => u.Roles).AutoInclude();
            e.Property<uint>("Version").IsRowVersion();
        });

        model.Entity<Role>(e =>
        {
            e.ToTable("roles");
            e.HasKey(r => r.Id);
            e.Property(r => r.BuiltInKey).HasMaxLength(32);
            e.Property(r => r.Name).HasMaxLength(Role.NameMax);
            e.Property(r => r.NormalizedName).HasMaxLength(Role.NameMax);
            e.Property(r => r.Description).HasMaxLength(Role.DescriptionMax);
            e.HasIndex(r => new { r.TenantId, r.NormalizedName }).IsUnique().HasDatabaseName(RoleNameIndex);
            e.HasIndex(r => new { r.TenantId, r.BuiltInKey }).IsUnique().HasFilter("built_in_key IS NOT NULL");
            e.HasOne<ClientAccount>().WithMany().HasForeignKey(r => r.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.Property(r => r.Version).IsRowVersion();
        });

        model.Entity<UserRole>(e =>
        {
            e.ToTable("user_roles");
            e.HasKey(ur => new { ur.UserId, ur.RoleId });
            e.HasIndex(ur => new { ur.TenantId, ur.RoleId });
            e.HasOne<Role>().WithMany().HasForeignKey(ur => ur.RoleId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<Invitation>(e =>
        {
            e.ToTable("invitations");
            e.HasKey(i => i.Id);
            e.Property(i => i.Email).HasMaxLength(254);
            e.Property(i => i.TokenHash).HasMaxLength(64);
            e.HasIndex(i => new { i.TenantId, i.TokenHash }).IsUnique();
            e.HasIndex(i => new { i.TenantId, i.UserId });
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(i => i.CreatedByName).HasMaxLength(200);
            e.HasOne<AppUser>().WithMany().HasForeignKey(i => i.UserId).OnDelete(DeleteBehavior.Cascade);
            e.Property<uint>("Version").IsRowVersion();
        });

        model.Entity<Site>(e =>
        {
            e.ToTable("sites");
            e.HasKey(s => s.Id);
            e.Property(s => s.Name).HasMaxLength(Site.NameMax);
            e.Property(s => s.Code).HasMaxLength(Site.CodeMax);
            e.HasIndex(s => new { s.TenantId, s.Code }).IsUnique().HasDatabaseName(SiteCodeIndex);
            e.HasOne<ClientAccount>().WithMany().HasForeignKey(s => s.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.Property<uint>("Version").IsRowVersion();
        });

        model.Entity<SupportPass>(e =>
        {
            e.ToTable("support_passes");
            e.HasKey(p => p.Id);
            e.Property(p => p.RequestedById).HasMaxLength(255);
            e.Property(p => p.RequestedByName).HasMaxLength(200);
            e.Property(p => p.Reason).HasMaxLength(SupportPass.ReasonMax);
            e.Property(p => p.Access).HasConversion<string>().HasMaxLength(16);
            e.Property(p => p.EndedByName).HasMaxLength(200);
            e.HasIndex(p => new { p.TenantId, p.StartedAt });
            e.Ignore(p => p.HeaderValue);
            e.HasOne<ClientAccount>().WithMany().HasForeignKey(p => p.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.Property<uint>("Version").IsRowVersion();
        });

        model.Entity<AuditEntry>(e =>
        {
            e.ToTable("audit_entries");
            e.HasKey(a => a.Id);
            e.Property(a => a.Id).UseIdentityAlwaysColumn();
            e.Property(a => a.ActorId).HasMaxLength(255);
            e.Property(a => a.ActorName).HasMaxLength(200);
            e.Property(a => a.ActorKind).HasConversion<string>().HasMaxLength(16);
            e.Property(a => a.Action).HasMaxLength(64);
            e.Property(a => a.TargetType).HasMaxLength(32);
            e.Property(a => a.Details).HasMaxLength(AuditEntry.DetailsMax);
            e.HasIndex(a => new { a.TenantId, a.At });
            e.HasIndex(a => new { a.TenantId, a.SupportPassId });
        });
    }
}
