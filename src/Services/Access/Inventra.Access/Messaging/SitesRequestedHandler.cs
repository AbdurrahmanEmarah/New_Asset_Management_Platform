using Inventra.Access.Data;
using Inventra.BuildingBlocks.Data;
using Inventra.Contracts.Access;
using Inventra.Contracts.Assets;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Messaging;

/// <summary>
/// The one-off backfill for site sync: Assets asks for a client's sites (it has none yet), and Access
/// sends every site of that client again. Works inside one client, so row-level security still applies.
/// </summary>
public static class SitesRequestedHandler
{
    public static async Task Handle(SitesRequested message, AccessDbContext db, ITenantContext tenant, IDbContextOutbox<AccessDbContext> outbox, CancellationToken ct)
    {
        await tenant.UseAsync(message.ClientId, ct);
        foreach (var site in await db.Sites.AsNoTracking().ToListAsync(ct))
            await outbox.PublishAsync(new SiteUpdated(site.TenantId, site.Id, site.Name, site.Code, site.IsActive, message.RequestedAt));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
    }
}
