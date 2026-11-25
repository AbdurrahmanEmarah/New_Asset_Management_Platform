using Inventra.Contracts.Assets;
using Inventra.Contracts.Documents;
using Inventra.Contracts.Shared;
using Inventra.Tenancy.Domain;
using Inventra.Tenancy.Data;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Tenancy.Messaging;

/// <summary>Keeps the asset and storage usage bars in step with Assets and Documents.</summary>
public static class UsageHandlers
{
    public static async Task Handle(ClientAssetsCounted message, TenancyDbContext db, CancellationToken ct)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == message.ClientId, ct)
            ?? throw new InvalidOperationException($"Assets counted assets for client {message.ClientId}, which Tenancy doesn't know.");
        if (client.ApplyAssetCount(message.Assets, message.CountedAt)) await db.SaveChangesAsync(ct);
    }

    public static async Task Handle(PlatformChangeRecorded message, TenancyDbContext db, CancellationToken ct)
    {
        db.AuditEntries.Add(PlatformAuditEntry.For(message.ActorId, message.ActorName, message.Action, null, message.Details, message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }

    public static async Task Handle(ClientStorageCounted message, TenancyDbContext db, CancellationToken ct)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == message.ClientId, ct)
            ?? throw new InvalidOperationException($"Documents counted storage for client {message.ClientId}, which Tenancy doesn't know.");
        if (client.ApplyStorage(message.Bytes, message.CountedAt)) await db.SaveChangesAsync(ct);
    }
}
