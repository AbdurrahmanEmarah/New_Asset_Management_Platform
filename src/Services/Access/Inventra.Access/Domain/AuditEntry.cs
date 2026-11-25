namespace Inventra.Access.Domain;

public enum ActorKind
{
    /// <summary>A person in the client company.</summary>
    User,
    /// <summary>Platform staff acting under a support pass.</summary>
    Support,
    /// <summary>Platform staff acting from the admin console (for example opening a support pass).</summary>
    Platform,
    /// <summary>Inventra itself, for example when a client is set up.</summary>
    System,
}

/// <summary>One entry in a client's own audit log. Written in the same transaction as the change.</summary>
public sealed class AuditEntry
{
    public const int DetailsMax = 2000;

    private AuditEntry() { }

    public long Id { get; private set; }
    public Guid TenantId { get; private set; }
    public DateTimeOffset At { get; private set; }
    public string ActorId { get; private set; } = "";
    public string ActorName { get; private set; } = "";
    public ActorKind ActorKind { get; private set; }
    public string Action { get; private set; } = "";
    public string? TargetType { get; private set; }
    public Guid? TargetId { get; private set; }
    public string Details { get; private set; } = "";
    public Guid? SupportPassId { get; private set; }

    public static AuditEntry Create(Guid tenantId, string actorId, string actorName, ActorKind kind, string action,
        string? targetType, Guid? targetId, string details, Guid? supportPassId, DateTimeOffset now) => new()
    {
        TenantId = tenantId,
        At = now,
        ActorId = actorId,
        ActorName = actorName,
        ActorKind = kind,
        Action = action,
        TargetType = targetType,
        TargetId = targetId,
        Details = details.Length > DetailsMax ? details[..DetailsMax] : details,
        SupportPassId = supportPassId,
    };

    public static AuditEntry System(Guid tenantId, string action, string details, DateTimeOffset now) =>
        Create(tenantId, "system", "Inventra", ActorKind.System, action, null, null, details, null, now);
}

public static class AccessAuditActions
{
    public const string ClientProvisioned = "client.provisioned";
    public const string ClientSuspended = "client.suspended";
    public const string ClientReactivated = "client.reactivated";
    public const string PlanChanged = "client.plan_changed";
    public const string UserInvited = "user.invited";
    public const string InvitationResent = "user.invitation_resent";
    public const string InvitationCancelled = "user.invitation_cancelled";
    public const string UserJoined = "user.joined";
    public const string UserDeactivated = "user.deactivated";
    public const string UserReactivated = "user.reactivated";
    public const string UserRolesChanged = "user.roles_changed";
    public const string RoleCreated = "role.created";
    public const string RoleUpdated = "role.updated";
    public const string RoleDeleted = "role.deleted";
    public const string SiteCreated = "site.created";
    public const string SiteUpdated = "site.updated";
    public const string SupportPassStarted = "support.pass_started";
    public const string SupportPassEnded = "support.pass_ended";
    public const string SupportRequest = "support.request";
    public const string OwnerInvitationReissued = "client.owner_invitation_reissued";
}
