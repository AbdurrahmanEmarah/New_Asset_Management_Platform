namespace Inventra.Access.Domain;

public enum ClientAccountStatus
{
    Active,
    Suspended,
}

/// <summary>Access's copy of a client, kept up to date from Tenancy's events. One row per client.</summary>
public sealed class ClientAccount
{
    private ClientAccount() { }

    /// <summary>The client's id. Named tenant_id like every Access table, so the same policy protects it.</summary>
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = "";
    public string Slug { get; private set; } = "";
    public string PlanKey { get; private set; } = "";
    public int MaxUsers { get; private set; }
    public ClientAccountStatus Status { get; private set; }
    public string? SuspendedReason { get; private set; }

    /// <summary>When Tenancy made the status and plan changes last applied here. Older events are ignored.</summary>
    public DateTimeOffset StatusChangedAt { get; private set; }
    public DateTimeOffset PlanChangedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    public static ClientAccount Create(Guid tenantId, string name, string slug, string planKey, int maxUsers, DateTimeOffset occurredAt) => new()
    {
        TenantId = tenantId,
        Name = name,
        Slug = slug,
        PlanKey = planKey,
        MaxUsers = maxUsers,
        Status = ClientAccountStatus.Active,
        StatusChangedAt = occurredAt,
        PlanChangedAt = occurredAt,
        CreatedAt = occurredAt,
    };

    /// <summary>Why this client's users can't sign in, or null when they can.</summary>
    public string? CannotSignInReason() => Status == ClientAccountStatus.Suspended
        ? $"{Name}'s Inventra account is suspended ({SuspendedReason}). Your company's Owner can contact Inventra to restore it."
        : null;

    /// <summary>Why one more seat can't be used, or null when it can.</summary>
    public string? CannotAddSeatReason(int seatsInUse) => seatsInUse >= MaxUsers
        ? $"Your plan allows {MaxUsers} users and all {MaxUsers} are in use (active users and open invitations). Deactivate someone or cancel an invitation, or ask your Owner about a bigger plan."
        : null;

    /// <summary>"ok" below 80% of the seat limit, "warn" from 80%, "blocked" at 100%.</summary>
    public string SeatState(int seatsInUse)
    {
        var ratio = MaxUsers <= 0 ? 1d : (double)seatsInUse / MaxUsers;
        return ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warn" : "ok";
    }

    public bool Suspend(string reason, DateTimeOffset occurredAt)
    {
        if (occurredAt < StatusChangedAt) return false;
        Status = ClientAccountStatus.Suspended;
        SuspendedReason = reason;
        StatusChangedAt = occurredAt;
        return true;
    }

    public bool Reactivate(DateTimeOffset occurredAt)
    {
        if (occurredAt < StatusChangedAt) return false;
        Status = ClientAccountStatus.Active;
        SuspendedReason = null;
        StatusChangedAt = occurredAt;
        return true;
    }

    public bool ChangePlan(string planKey, int maxUsers, DateTimeOffset occurredAt)
    {
        if (occurredAt < PlanChangedAt) return false;
        PlanKey = planKey;
        MaxUsers = maxUsers;
        PlanChangedAt = occurredAt;
        return true;
    }
}
