using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Data;
using Inventra.Contracts.Shared;

namespace Inventra.Access.Messaging;

/// <summary>Writes what happened in other client services to the client's own audit log, so each client has one log.</summary>
public static class ClientActivityHandler
{
    public static async Task Handle(ClientActivityRecorded message, AccessDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(message.ClientId, ct);
        var kind = message.ActorKind switch
        {
            "support" => ActorKind.Support,
            "system" => ActorKind.System,
            _ => ActorKind.User,
        };
        db.AuditEntries.Add(AuditEntry.Create(message.ClientId, message.ActorId, message.ActorName, kind, message.Action,
            message.TargetType, message.TargetId, message.Details, message.SupportPassId, message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }
}
