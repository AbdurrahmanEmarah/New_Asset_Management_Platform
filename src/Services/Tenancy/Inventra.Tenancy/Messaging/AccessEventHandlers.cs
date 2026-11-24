using Inventra.Contracts.Access;
using Inventra.Tenancy.Data;
using Inventra.Tenancy.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Tenancy.Messaging;

/// <summary>Keeps the client's user usage bar in step with Access.</summary>
public static class ClientUsersCountedHandler
{
    public static async Task Handle(ClientUsersCounted message, TenancyDbContext db, ILogger<ClientUsersCounted> logger, CancellationToken ct)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == message.ClientId, ct)
            ?? throw new InvalidOperationException($"Access counted users for client {message.ClientId}, which Tenancy doesn't know.");

        if (!client.ApplyUserCount(message.Seats, message.CountedAt))
        {
            logger.LogInformation("Ignored an older user count for client {ClientId}", message.ClientId);
            return;
        }

        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Writes platform staff actions taken in Access to the platform audit log.</summary>
public static class PlatformActivityRecordedHandler
{
    public static async Task Handle(PlatformActivityRecorded message, TenancyDbContext db, CancellationToken ct)
    {
        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == message.ClientId, ct);
        db.AuditEntries.Add(PlatformAuditEntry.For(message.ActorId, message.ActorName, message.Action, client, message.Details, message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }
}
