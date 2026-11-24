namespace Inventra.Tenancy.Domain;

public enum ClientStatus
{
    Trial,
    Active,
    PaymentDue,
    Suspended,
    Closed,
}

/// <summary>A client company (tenant) on the platform.</summary>
public sealed class Client
{
    private Client() { }

    public Guid Id { get; private set; }
    public string Name { get; private set; } = "";

    /// <summary>The sub-domain: {slug}.inventra… Never changes after creation.</summary>
    public string Slug { get; private set; } = "";

    public string Region { get; private set; } = "";
    public string PlanKey { get; private set; } = "";
    public ClientStatus Status { get; private set; }
    public string OwnerName { get; private set; } = "";
    public string OwnerEmail { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? TrialEndsAt { get; private set; }
    public string? SuspendedReason { get; private set; }
    public DateTimeOffset? SuspendedAt { get; private set; }

    /// <summary>Usage counters, kept up to date by events from Access, Assets and Documents.</summary>
    public int UsersUsed { get; private set; }
    public int AssetsUsed { get; private set; }
    public long StorageUsedMb { get; private set; }

    public static Client Create(string name, string slug, string region, Plan plan, string ownerName, string ownerEmail, DateTimeOffset now) =>
        new()
        {
            Id = Guid.CreateVersion7(now),
            Name = name.Trim(),
            Slug = slug,
            Region = region,
            PlanKey = plan.Key,
            Status = plan.IsTrial ? ClientStatus.Trial : ClientStatus.Active,
            TrialEndsAt = plan.IsTrial ? now.AddDays(PlanCatalog.TrialDays) : null,
            OwnerName = ownerName.Trim(),
            OwnerEmail = ownerEmail.Trim().ToLowerInvariant(),
            CreatedAt = now,
        };

    /// <summary>Why the client can't be suspended, or null when it can.</summary>
    public string? CannotSuspendReason() => Status switch
    {
        ClientStatus.Suspended => "This client is already suspended.",
        ClientStatus.Closed => "This client is closed.",
        _ => null,
    };

    public void Suspend(string reason, DateTimeOffset now)
    {
        if (CannotSuspendReason() is { } why) throw new InvalidOperationException(why);
        Status = ClientStatus.Suspended;
        SuspendedReason = reason.Trim();
        SuspendedAt = now;
    }

    public string? CannotReactivateReason() => Status == ClientStatus.Suspended ? null : "Only a suspended client can be reactivated.";

    public void Reactivate(Plan plan, DateTimeOffset now)
    {
        if (CannotReactivateReason() is { } why) throw new InvalidOperationException(why);
        Status = plan.IsTrial && TrialEndsAt > now ? ClientStatus.Trial : ClientStatus.Active;
        SuspendedReason = null;
        SuspendedAt = null;
    }

    /// <summary>Why the client can't move to this plan, or null when it can.</summary>
    public string? CannotChangePlanReason(Plan target)
    {
        if (Status == ClientStatus.Closed) return "This client is closed.";
        if (target.Key == PlanKey) return $"This client is already on {target.Name}.";
        if (target.IsTrial) return "A client can't be moved back to a trial.";
        if (UsersUsed > target.MaxUsers)
            return $"{Name} has {UsersUsed} users but {target.Name} allows {target.MaxUsers}. Ask them to remove users first.";
        if (AssetsUsed > target.MaxAssets)
            return $"{Name} has {AssetsUsed:N0} assets but {target.Name} allows {target.MaxAssets:N0}.";
        return null;
    }

    public void ChangePlan(Plan target)
    {
        if (CannotChangePlanReason(target) is { } why) throw new InvalidOperationException(why);
        PlanKey = target.Key;
        if (Status == ClientStatus.Trial) Status = ClientStatus.Active;
        TrialEndsAt = null;
    }

    /// <summary>When Access last counted this client's seats. Older reports are ignored.</summary>
    public DateTimeOffset? UsersCountedAt { get; private set; }

    internal void SetUsage(int users, int assets, long storageMb)
    {
        UsersUsed = users;
        AssetsUsed = assets;
        StorageUsedMb = storageMb;
    }

    /// <summary>Applies a seat count from Access unless a newer one was already applied. True when applied.</summary>
    public bool ApplyUserCount(int seats, DateTimeOffset countedAt)
    {
        if (UsersCountedAt is { } last && last >= countedAt) return false;
        UsersUsed = Math.Max(0, seats);
        UsersCountedAt = countedAt;
        return true;
    }
}
