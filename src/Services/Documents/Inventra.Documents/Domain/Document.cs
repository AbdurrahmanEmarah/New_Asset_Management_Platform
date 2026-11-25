namespace Inventra.Documents.Domain;

/// <summary>A file (PDF or image) attached to an asset. The bytes live in Blob storage under BlobName.</summary>
public sealed class Document
{
    public const int FileNameMax = 200;

    private Document() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid AssetId { get; private set; }
    public string FileName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long SizeBytes { get; private set; }
    public string BlobName { get; private set; } = "";
    public string UploadedById { get; private set; } = "";
    public string UploadedByName { get; private set; } = "";
    public DateTimeOffset UploadedAt { get; private set; }

    public static Document Create(Guid tenantId, Guid assetId, string fileName, string contentType, long size, string byId, string byName, DateTimeOffset now)
    {
        var id = Guid.CreateVersion7(now);
        return new Document
        {
            Id = id,
            TenantId = tenantId,
            AssetId = assetId,
            FileName = Clean(fileName),
            ContentType = contentType,
            SizeBytes = size,
            BlobName = $"{tenantId:N}/{assetId:N}/{id:N}",
            UploadedById = byId,
            UploadedByName = byName,
            UploadedAt = now,
        };
    }

    /// <summary>Keeps the file name readable and safe to show: no folders, no control characters.</summary>
    public static string Clean(string fileName)
    {
        var name = Path.GetFileName(fileName.Replace('\\', '/')).Trim();
        name = new string(name.Where(c => !char.IsControl(c)).ToArray());
        if (name.Length == 0) name = "file";
        return name.Length > FileNameMax ? name[..FileNameMax] : name;
    }
}

/// <summary>The kinds of file that can be uploaded, recognised by their first bytes (not by the name the browser sends).</summary>
public static class FileKinds
{
    public static string? Detect(ReadOnlySpan<byte> head)
    {
        if (head.StartsWith("%PDF-"u8)) return "application/pdf";
        if (head.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (head.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF })) return "image/jpeg";
        if (head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}

/// <summary>The client's plan storage limit, from Tenancy's events.</summary>
public sealed class StorageLimit
{
    private StorageLimit() { }

    public Guid TenantId { get; private set; }
    public long LimitBytes { get; private set; }
    public DateTimeOffset ChangedAt { get; private set; }

    public static StorageLimit Create(Guid tenantId, long storageMb, DateTimeOffset at) =>
        new() { TenantId = tenantId, LimitBytes = storageMb * 1024 * 1024, ChangedAt = at };

    public bool TryChange(long storageMb, DateTimeOffset at)
    {
        if (at < ChangedAt) return false;
        LimitBytes = storageMb * 1024 * 1024;
        ChangedAt = at;
        return true;
    }

    /// <summary>Why this upload doesn't fit, or null. Blocks at 100% of the plan.</summary>
    public string? CannotStoreReason(long usedBytes, long addBytes) => usedBytes + addBytes > LimitBytes
        ? $"This file doesn't fit: your plan includes {LimitBytes / (1024 * 1024 * 1024.0):0.#} GB of storage and {usedBytes / (1024 * 1024.0):N0} MB is in use. Delete files you no longer need, or ask your Owner about a bigger plan."
        : null;
}
