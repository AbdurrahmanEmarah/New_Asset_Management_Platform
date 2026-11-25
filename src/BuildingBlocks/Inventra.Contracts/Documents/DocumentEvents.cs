namespace Inventra.Contracts.Documents;

/// <summary>How much file storage a client uses. Tenancy keeps the one with the latest CountedAt.</summary>
public sealed record ClientStorageCounted(Guid ClientId, long Bytes, DateTimeOffset CountedAt);
