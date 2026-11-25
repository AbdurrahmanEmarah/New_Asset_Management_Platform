using Inventra.BuildingBlocks.Data;
using Inventra.Contracts.Tenancy;
using Inventra.Documents.Data;
using Inventra.Documents.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Documents.Messaging;

/// <summary>Keeps the plan's storage limit in step with Tenancy.</summary>
public static class PlanLimitHandlers
{
    public static Task Handle(ClientCreated message, DocumentsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        SetAsync(message.ClientId, message.StorageMb, message.OccurredAt, db, tenant, ct);

    public static Task Handle(ClientPlanChanged message, DocumentsDbContext db, ITenantContext tenant, CancellationToken ct) =>
        SetAsync(message.ClientId, message.StorageMb, message.OccurredAt, db, tenant, ct);

    private static async Task SetAsync(Guid clientId, long storageMb, DateTimeOffset at, DocumentsDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(clientId, ct);
        var limit = await db.Limits.SingleOrDefaultAsync(ct);
        if (limit is null) db.Limits.Add(StorageLimit.Create(clientId, storageMb, at));
        else if (!limit.TryChange(storageMb, at)) return;
        await db.SaveChangesAsync(ct);
    }
}
