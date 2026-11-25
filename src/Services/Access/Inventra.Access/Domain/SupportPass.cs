namespace Inventra.Access.Domain;

public enum SupportAccess
{
    /// <summary>Can look, can't change anything. The default.</summary>
    Read,
    /// <summary>Can also make changes. Only the Platform Owner can open one.</summary>
    Change,
}

public enum SupportPassStatus
{
    Active,
    Expired,
    Ended,
}

/// <summary>
/// Time-limited access for one platform staff member to one client. Everything done under it is
/// written to that client's audit log, and the client's admins can see and end it.
/// </summary>
public sealed class SupportPass
{
    public const int MinMinutes = 15;
    public const int MaxMinutes = 8 * 60;
    public const int DefaultMinutes = 60;
    public const int ReasonMin = 10;
    public const int ReasonMax = 500;

    /// <summary>The header that carries a pass on requests: "X-Support-Pass: {clientId:N}.{passId:N}".</summary>
    public const string Header = "X-Support-Pass";

    private SupportPass() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string RequestedById { get; private set; } = "";
    public string RequestedByName { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public SupportAccess Access { get; private set; }
    public DateTimeOffset StartedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? EndedAt { get; private set; }
    public string? EndedByName { get; private set; }

    public static SupportPass Start(Guid tenantId, string byId, string byName, string reason, SupportAccess access, int minutes, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        RequestedById = byId,
        RequestedByName = byName,
        Reason = reason.Trim(),
        Access = access,
        StartedAt = now,
        ExpiresAt = now.AddMinutes(minutes),
    };

    public string HeaderValue => $"{TenantId:N}.{Id:N}";

    public static (Guid TenantId, Guid PassId)? ParseHeader(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var parts = value.Trim().Split('.');
        return parts.Length == 2 && Guid.TryParseExact(parts[0], "N", out var tenant) && Guid.TryParseExact(parts[1], "N", out var pass)
            ? (tenant, pass)
            : null;
    }

    public SupportPassStatus StatusAt(DateTimeOffset now) =>
        EndedAt is not null ? SupportPassStatus.Ended : now >= ExpiresAt ? SupportPassStatus.Expired : SupportPassStatus.Active;

    /// <summary>Why this staff member can't act under the pass right now, or null when they can.</summary>
    public string? CannotUseReason(string actorId, DateTimeOffset now)
    {
        if (RequestedById != actorId) return "This support pass belongs to someone else. Request your own pass.";
        return StatusAt(now) switch
        {
            SupportPassStatus.Ended => $"This support pass was ended by {EndedByName}. Request a new one if you still need access.",
            SupportPassStatus.Expired => $"This support pass expired at {ExpiresAt:HH:mm} UTC. Request a new one if you still need access.",
            _ => null,
        };
    }

    public string? CannotEndReason(DateTimeOffset now) => StatusAt(now) switch
    {
        SupportPassStatus.Ended => "This support pass has already ended.",
        SupportPassStatus.Expired => "This support pass has already expired.",
        _ => null,
    };

    public void End(string byName, DateTimeOffset now)
    {
        if (CannotEndReason(now) is { } why) throw new InvalidOperationException(why);
        EndedAt = now;
        EndedByName = byName;
    }
}
