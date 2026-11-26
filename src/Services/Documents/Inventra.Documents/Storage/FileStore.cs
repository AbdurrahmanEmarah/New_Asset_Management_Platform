using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;

namespace Inventra.Documents.Storage;

/// <summary>Where file bytes live. Blob storage in Azure and locally (Azurite); in memory in tests.</summary>
public interface IFileStore
{
    Task SaveAsync(string name, Stream content, string contentType, CancellationToken ct);

    Task DeleteAsync(string name, CancellationToken ct);

    /// <summary>A link that downloads the file for a short time, without a token, under the given file name.</summary>
    Task<Uri> DownloadLinkAsync(string name, string fileName, TimeSpan lifetime, CancellationToken ct);
}

public sealed class BlobOptions
{
    public const string Section = "Blob";

    /// <summary>Azure: the account's blob endpoint (or Storage:BlobEndpoint from Bicep), used with managed identity.</summary>
    public string? ServiceUri { get; set; }
    public string Container { get; set; } = "documents";
}

/// <summary>
/// Azure Blob storage. With a connection string (Azurite, from the AppHost) links are signed with the
/// account key; with ServiceUri and managed identity they are signed with a user delegation key.
/// </summary>
internal sealed class BlobFileStore : IFileStore
{
    private readonly BlobServiceClient _service;
    private readonly BlobContainerClient _container;
    private bool _created;

    public BlobFileStore(IConfiguration config)
    {
        var options = config.GetSection(BlobOptions.Section).Get<BlobOptions>() ?? new BlobOptions();
        var connection = config.GetConnectionString("documents-blobs");
        options.ServiceUri ??= config["Storage:BlobEndpoint"]; // set by infra/main.bicep
        _service = !string.IsNullOrWhiteSpace(connection)
            ? new BlobServiceClient(connection)
            : !string.IsNullOrWhiteSpace(options.ServiceUri)
                ? new BlobServiceClient(new Uri(options.ServiceUri), new DefaultAzureCredential())
                : throw new InvalidOperationException("File storage isn't configured. Set ConnectionStrings:documents-blobs (local) or Blob:ServiceUri (Azure).");
        _container = _service.GetBlobContainerClient(options.Container);
    }

    private async Task<BlobContainerClient> ContainerAsync(CancellationToken ct)
    {
        if (!_created)
        {
            await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);
            _created = true;
        }

        return _container;
    }

    public async Task SaveAsync(string name, Stream content, string contentType, CancellationToken ct)
    {
        var container = await ContainerAsync(ct);
        await container.GetBlobClient(name).UploadAsync(content, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } }, ct);
    }

    public async Task DeleteAsync(string name, CancellationToken ct) =>
        await (await ContainerAsync(ct)).GetBlobClient(name).DeleteIfExistsAsync(cancellationToken: ct);

    public async Task<Uri> DownloadLinkAsync(string name, string fileName, TimeSpan lifetime, CancellationToken ct)
    {
        var blob = (await ContainerAsync(ct)).GetBlobClient(name);
        var sas = new BlobSasBuilder(BlobSasPermissions.Read, DateTimeOffset.UtcNow.Add(lifetime))
        {
            BlobContainerName = blob.BlobContainerName,
            BlobName = blob.Name,
            Resource = "b",
            ContentDisposition = $"attachment; filename=\"{fileName.Replace("\"", "")}\"",
        };
        if (blob.CanGenerateSasUri) return blob.GenerateSasUri(sas);

        var key = await _service.GetUserDelegationKeyAsync(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.Add(lifetime), ct);
        return new BlobUriBuilder(blob.Uri) { Sas = sas.ToSasQueryParameters(key.Value, _service.AccountName) }.ToUri();
    }
}
