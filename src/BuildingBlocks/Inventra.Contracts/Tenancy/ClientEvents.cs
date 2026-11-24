namespace Inventra.Contracts.Tenancy;

// Published by Tenancy (exchange "inventra.tenancy.events"). Each event carries OccurredAt so a
// subscriber can ignore one that arrives after a newer change.

/// <summary>A client was created. Access sets up its roles and invites its Owner.</summary>
public sealed record ClientCreated(
    Guid ClientId,
    string Name,
    string Slug,
    string PlanKey,
    int MaxUsers,
    string OwnerName,
    string OwnerEmail,
    DateTimeOffset OccurredAt);

/// <summary>A client was suspended. Its users can't sign in until it is reactivated.</summary>
public sealed record ClientSuspended(Guid ClientId, string Reason, DateTimeOffset OccurredAt);

/// <summary>A suspended client was reactivated.</summary>
public sealed record ClientReactivated(Guid ClientId, DateTimeOffset OccurredAt);

/// <summary>A client moved to another plan. MaxUsers is the new seat limit.</summary>
public sealed record ClientPlanChanged(Guid ClientId, string PlanKey, int MaxUsers, DateTimeOffset OccurredAt);
