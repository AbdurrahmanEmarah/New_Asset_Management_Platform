using Inventra.Tenancy.Domain;

namespace Inventra.Tenancy.Api;

public sealed record CreateClientRequest(
    string? Name, string? Slug, string? Region, string? PlanKey, string? OwnerName, string? OwnerEmail);

public sealed record SuspendClientRequest(string? Reason);

public sealed record ChangePlanRequest(string? PlanKey);

public sealed record PlanRef(string Key, string Name);

/// <summary>"ok" below 80%, "warn" from 80%, "blocked" at 100% (new items are refused).</summary>
public sealed record UsageLine(long Used, long Limit, string State)
{
    public static UsageLine Of(long used, long limit)
    {
        var ratio = limit <= 0 ? 1d : (double)used / limit;
        return new UsageLine(used, limit, ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warn" : "ok");
    }
}

public sealed record ClientUsage(UsageLine Users, UsageLine Assets, UsageLine StorageMb);

public sealed record ClientResponse(
    Guid Id,
    string Name,
    string Slug,
    string Region,
    string RegionName,
    PlanRef Plan,
    string Status,
    string OwnerName,
    string OwnerEmail,
    DateTimeOffset CreatedAt,
    DateTimeOffset? TrialEndsAt,
    string? SuspendedReason,
    ClientUsage Usage)
{
    public static ClientResponse From(Client c, Plan plan) => new(
        c.Id, c.Name, c.Slug, c.Region, Regions.NameOf(c.Region), new PlanRef(plan.Key, plan.Name),
        StatusName(c.Status), c.OwnerName, c.OwnerEmail, c.CreatedAt, c.TrialEndsAt, c.SuspendedReason,
        new ClientUsage(
            UsageLine.Of(c.UsersUsed, plan.MaxUsers),
            UsageLine.Of(c.AssetsUsed, plan.MaxAssets),
            UsageLine.Of(c.StorageUsedMb, plan.StorageGb * 1024L)));

    public static string StatusName(ClientStatus s) => s switch
    {
        ClientStatus.Trial => "trial",
        ClientStatus.Active => "active",
        ClientStatus.PaymentDue => "payment_due",
        ClientStatus.Suspended => "suspended",
        ClientStatus.Closed => "closed",
        _ => s.ToString().ToLowerInvariant(),
    };

    public bool NearLimit => Usage.Users.State != "ok" || Usage.Assets.State != "ok" || Usage.StorageMb.State != "ok";
}

public sealed record ClientSummary(int Active, int Trial, int Suspended, int NearLimit, long SeatsInUse);

public sealed record PlanResponse(string Key, string Name, int MaxUsers, int MaxAssets, int StorageGb, IReadOnlyList<string> Modules, bool IsTrial)
{
    public static PlanResponse From(Plan p) => new(p.Key, p.Name, p.MaxUsers, p.MaxAssets, p.StorageGb, p.Modules, p.IsTrial);
}

public sealed record RegionResponse(string Key, string Name);

public sealed record AuditEntryResponse(long Id, DateTimeOffset At, string ActorName, string Action, Guid? ClientId, string? ClientName, string Details);

/// <summary>What the signed-in platform user may do, so the console can explain disabled buttons.</summary>
public sealed record MeResponse(string Id, string Name, string? Email, IReadOnlyCollection<string> Roles, bool CanManageClients, bool CanManageBilling);
