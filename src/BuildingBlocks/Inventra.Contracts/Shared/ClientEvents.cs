namespace Inventra.Contracts.Shared;

// Published by every client-scoped service (Catalog, Assets, Documents, ...) to its own exchange.

/// <summary>
/// Something happened inside a client: a change, or any request made under a support pass.
/// Access writes it to that client's audit log, so each client has one log for all services.
/// ActorKind is "user", "support" or "system".
/// </summary>
public sealed record ClientActivityRecorded(
    Guid ClientId,
    string Service,
    string ActorId,
    string ActorName,
    string ActorKind,
    string Action,
    string? TargetType,
    Guid? TargetId,
    string Details,
    Guid? SupportPassId,
    DateTimeOffset OccurredAt);

/// <summary>Platform staff changed something that belongs to no client (e.g. the template library). Tenancy writes it to the platform audit log.</summary>
public sealed record PlatformChangeRecorded(string Service, string ActorId, string ActorName, string Action, string Details, DateTimeOffset OccurredAt);

/// <summary>A service has no plan limits for this client yet (a client from before the service existed). Tenancy answers with ClientLimitsAnnounced.</summary>
public sealed record ClientLimitsRequested(Guid ClientId, string Service, DateTimeOffset RequestedAt);
