namespace Inventra.Documents.Api;

public sealed record DocumentResponse(
    Guid Id, Guid AssetId, string FileName, string ContentType, long SizeBytes, string UploadedByName, DateTimeOffset UploadedAt)
{
    public static DocumentResponse From(Domain.Document d) => new(d.Id, d.AssetId, d.FileName, d.ContentType, d.SizeBytes, d.UploadedByName, d.UploadedAt);
}

/// <summary>Opens or downloads the file without a token until ExpiresAt (a few minutes).</summary>
public sealed record DownloadLinkResponse(string Url, DateTimeOffset ExpiresAt);

/// <summary>Storage in use against the plan. State: ok, warn (80%+), blocked (100%).</summary>
public sealed record StorageUsageResponse(long UsedBytes, long LimitBytes, string State);
