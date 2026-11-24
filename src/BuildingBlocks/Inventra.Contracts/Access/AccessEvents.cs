namespace Inventra.Contracts.Access;

// Published by Access (exchange "inventra.access.events").

/// <summary>
/// How many seats a client uses: active users plus open invitations. Sent after every change,
/// and safe to apply more than once; Tenancy keeps the one with the latest CountedAt.
/// </summary>
public sealed record ClientUsersCounted(Guid ClientId, int Seats, int Active, int Invited, DateTimeOffset CountedAt);

/// <summary>
/// Platform staff did something inside a client through Access (for example requested a support pass).
/// Tenancy writes it to the platform audit log.
/// </summary>
public sealed record PlatformActivityRecorded(
    string ActorId,
    string ActorName,
    string Action,
    Guid ClientId,
    string Details,
    DateTimeOffset OccurredAt);
