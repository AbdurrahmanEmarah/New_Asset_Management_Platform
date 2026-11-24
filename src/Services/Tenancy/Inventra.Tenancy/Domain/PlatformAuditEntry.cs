namespace Inventra.Tenancy.Domain;

/// <summary>One action taken by platform staff. Written in the same transaction as the change.</summary>
public sealed class PlatformAuditEntry
{
    public long Id { get; private set; }
    public DateTimeOffset At { get; private set; }
    public string ActorId { get; private set; } = "";
    public string ActorName { get; private set; } = "";
    public string Action { get; private set; } = "";
    public Guid? ClientId { get; private set; }
    public string? ClientName { get; private set; }
    public string Details { get; private set; } = "";

    public static PlatformAuditEntry For(string actorId, string actorName, string action, Client? client, string details, DateTimeOffset now) =>
        new()
        {
            At = now,
            ActorId = actorId,
            ActorName = actorName,
            Action = action,
            ClientId = client?.Id,
            ClientName = client?.Name,
            Details = details,
        };
}

public static class AuditActions
{
    public const string ClientCreated = "client.created";
    public const string ClientSuspended = "client.suspended";
    public const string ClientReactivated = "client.reactivated";
    public const string PlanChanged = "client.plan_changed";

    /// <summary>Recorded by Access: a support pass was requested or ended, or the Owner invitation reissued.</summary>
    public const string SupportPassStarted = "support.pass_started";
    public const string SupportPassEnded = "support.pass_ended";
    public const string OwnerInvitationReissued = "client.owner_invitation_reissued";
}
