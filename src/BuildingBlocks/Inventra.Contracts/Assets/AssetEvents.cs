namespace Inventra.Contracts.Assets;

/// <summary>How many assets a client has (retired ones excluded). Tenancy keeps the one with the latest CountedAt.</summary>
public sealed record ClientAssetsCounted(Guid ClientId, int Assets, DateTimeOffset CountedAt);
