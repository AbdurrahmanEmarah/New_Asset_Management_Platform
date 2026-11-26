using Inventra.Assets.Data;
using Inventra.Assets.Domain;
using Inventra.BuildingBlocks.Data;
using Inventra.Contracts.Access;
using Inventra.Contracts.Catalog;
using Inventra.Contracts.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Assets.Messaging;

/// <summary>Keeps Assets' copy of each asset type in step with Catalog. Older versions are ignored.</summary>
public static class AssetTypePublishedHandler
{
    public static async Task Handle(AssetTypePublished message, AssetsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(message.ClientId, ct);
        var copy = await db.Types.FirstOrDefaultAsync(t => t.TypeId == message.TypeId, ct);
        if (copy is null) db.Types.Add(AssetTypeCopy.From(message));
        else if (!copy.TryApply(message)) return;
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Keeps the plan's asset limit in step with Tenancy.</summary>
public static class PlanLimitHandler
{
    public static Task Handle(ClientCreated message, AssetsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        SetAsync(message.ClientId, message.MaxAssets, message.OccurredAt, newClient: true, db, tenant, ct);

    public static Task Handle(ClientPlanChanged message, AssetsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        SetAsync(message.ClientId, message.MaxAssets, message.OccurredAt, newClient: false, db, tenant, ct);

    public static Task Handle(ClientLimitsAnnounced message, AssetsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        SetAsync(message.ClientId, message.MaxAssets, message.OccurredAt, newClient: false, db, tenant, ct);

    private static async Task SetAsync(Guid clientId, int maxAssets, DateTimeOffset at, bool newClient, AssetsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(clientId, ct);
        var limit = await db.Limits.SingleOrDefaultAsync(ct);
        if (limit is null) db.Limits.Add(ClientLimit.Create(clientId, maxAssets, at, newClient));
        else if (!limit.TryChange(maxAssets, at)) return;
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Keeps Assets' copy of the client's sites in step with Access.</summary>
public static class SiteSyncHandler
{
    public static Task Handle(SiteCreated m, AssetsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        ApplyAsync(m.ClientId, m.SiteId, m.Name, m.Code, m.IsActive, m.OccurredAt, db, tenant, ct);

    public static Task Handle(SiteUpdated m, AssetsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        ApplyAsync(m.ClientId, m.SiteId, m.Name, m.Code, m.IsActive, m.OccurredAt, db, tenant, ct);

    private static async Task ApplyAsync(Guid clientId, Guid siteId, string name, string code, bool active, DateTimeOffset at,
        AssetsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(clientId, ct);
        var site = await db.Sites.FirstOrDefaultAsync(s => s.SiteId == siteId, ct);
        if (site is null) db.Sites.Add(site = SiteCopy.Create(clientId, siteId));
        if (!site.TryApply(name, code, active, at)) return;
        await db.SaveChangesAsync(ct);
    }
}
