using System.Collections.Concurrent;
using Inventra.Contracts.Documents;
using Inventra.Contracts.Tenancy;
using Inventra.Documents.Api;
using Inventra.Documents.Storage;
using Inventra.Testing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

[assembly: AssemblyFixture(typeof(Inventra.Documents.Tests.DocumentsApi))]

namespace Inventra.Documents.Tests;

public sealed class DocumentsApi : ServiceApi<Program>
{
    public MemoryFileStore Files { get; } = new();
    public FakeAssets Assets { get; } = new();

    protected override string Name => "documents";
    protected override string ConnectionName => "documentsdb";
    protected override Type[] ObservedHandlers => [typeof(ObservedDocumentEvents)];

    protected override void Configure(IWebHostBuilder builder) => builder.ConfigureTestServices(s =>
    {
        s.RemoveAll<IFileStore>();
        s.AddSingleton<IFileStore>(Files);
        s.RemoveAll<IAssetLookup>();
        s.AddSingleton<IAssetLookup>(Assets);
    });

    public async Task<Guid> ClientAsync(long storageMb = 1024)
    {
        var id = Guid.NewGuid();
        await DeliverAsync(new ClientCreated(id, "Test Co.", $"t-{id:N}"[..20], "business", 25, "Owner", "owner@example.test", DateTimeOffset.UtcNow, 100, storageMb));
        return id;
    }
}

/// <summary>Files kept in memory. Links are memory://{name}.</summary>
public sealed class MemoryFileStore : IFileStore
{
    public ConcurrentDictionary<string, byte[]> Blobs { get; } = new();

    public async Task SaveAsync(string name, Stream content, string contentType, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        Blobs[name] = buffer.ToArray();
    }

    public Task DeleteAsync(string name, CancellationToken ct)
    {
        Blobs.TryRemove(name, out _);
        return Task.CompletedTask;
    }

    public Task<Uri> DownloadLinkAsync(string name, string fileName, TimeSpan lifetime, CancellationToken ct) =>
        Task.FromResult(new Uri($"memory://{name}?file={Uri.EscapeDataString(fileName)}"));
}

/// <summary>Stands in for Assets: assets registered here are visible; Hidden ones answer like an asset at another site.</summary>
public sealed class FakeAssets : IAssetLookup
{
    public ConcurrentDictionary<Guid, AssetAccess> Visible { get; } = new();

    public Guid Add(string tag, string? cannotEditReason = null)
    {
        var id = Guid.NewGuid();
        Visible[id] = new AssetAccess(id, tag, cannotEditReason);
        return id;
    }

    public Task<AssetAccess?> FindAsync(HttpContext http, Guid assetId, CancellationToken ct) =>
        Task.FromResult(Visible.TryGetValue(assetId, out var a) ? a : null);
}

/// <summary>Stands in for Tenancy: records storage totals.</summary>
public static class ObservedDocumentEvents
{
    public static void Handle(ClientStorageCounted m, PublishedEvents e) => e.Add(m);
}
