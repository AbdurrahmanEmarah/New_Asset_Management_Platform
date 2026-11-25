namespace Inventra.Contracts.Assets;

/// <summary>How many assets a client has (retired ones excluded). Tenancy keeps the one with the latest CountedAt.</summary>
public sealed record ClientAssetsCounted(Guid ClientId, int Assets, DateTimeOffset CountedAt);

/// <summary>Assets has no copy of this client's sites yet (a client from before site sync). Access answers with SiteUpdated for each site.</summary>
public sealed record SitesRequested(Guid ClientId, DateTimeOffset RequestedAt);
