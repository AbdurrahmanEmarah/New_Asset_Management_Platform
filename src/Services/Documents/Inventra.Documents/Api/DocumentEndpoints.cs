using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Documents;
using Inventra.Documents.Data;
using Inventra.Documents.Domain;
using Inventra.Documents.Storage;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Documents.Api;

public static class DocumentEndpoints
{
    public const string Service = "documents";
    public const long MaxBytes = 25L * 1024 * 1024;
    private static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(5);

    public static RouteGroupBuilder MapDocumentEndpoints(this RouteGroupBuilder app)
    {
        app.MapGet("/assets/{assetId:guid}/documents", List).WithTags("Documents").RequirePermission("assets.read")
            .Produces<List<DocumentResponse>>().ProducesProblem(404);
        app.MapPost("/assets/{assetId:guid}/documents", Upload).WithTags("Documents").RequirePermission("assets.write")
            .DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(MaxBytes + 1024 * 1024))
            .Accepts<IFormFile>("multipart/form-data").Produces<DocumentResponse>(201).ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409)
            .WithSummary("Uploads one PDF or image (PNG, JPEG, WebP) up to 25 MB, as the form field \"file\".");
        app.MapGet("/documents/{id:guid}", Get).WithTags("Documents").RequirePermission("assets.read").Produces<DocumentResponse>().ProducesProblem(404);
        app.MapGet("/documents/{id:guid}/link", Link).WithTags("Documents").RequirePermission("assets.read").Produces<DownloadLinkResponse>().ProducesProblem(404)
            .WithSummary("A short-lived download link (5 minutes).");
        app.MapDelete("/documents/{id:guid}", Delete).WithTags("Documents").RequirePermission("assets.write").Produces(204).ProducesProblem(404).ProducesProblem(409);
        app.MapGet("/usage", Usage).WithTags("Documents").RequirePermission("assets.read").Produces<StorageUsageResponse>();
        return app;
    }

    private static IResult NoSuchAsset() => Problems.NotFound("No asset has this id, or it's at a site your role doesn't cover.");

    private static IResult NoSuchDocument() => Problems.NotFound("No file has this id, or its asset is at a site your role doesn't cover.");

    /// <summary>The document, if its asset is visible to the caller in Assets.</summary>
    private static async Task<(Document? Document, AssetAccess? Asset)> FindAsync(Guid id, HttpContext http, DocumentsDbContext db, IAssetLookup assets, CancellationToken ct)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (document is null) return (null, null);
        var asset = await assets.FindAsync(http, document.AssetId, ct);
        return asset is null ? (null, null) : (document, asset);
    }

    internal static async Task<IResult> List(Guid assetId, HttpContext http, DocumentsDbContext db, IAssetLookup assets, CancellationToken ct)
    {
        if (await assets.FindAsync(http, assetId, ct) is null) return NoSuchAsset();
        var rows = await db.Documents.AsNoTracking().Where(d => d.AssetId == assetId).OrderByDescending(d => d.UploadedAt).ToListAsync(ct);
        return TypedResults.Ok(rows.Select(DocumentResponse.From).ToList());
    }

    internal static async Task<IResult> Get(Guid id, HttpContext http, DocumentsDbContext db, IAssetLookup assets, CancellationToken ct)
    {
        var (document, _) = await FindAsync(id, http, db, assets, ct);
        return document is null ? NoSuchDocument() : TypedResults.Ok(DocumentResponse.From(document));
    }

    internal static async Task<IResult> Upload(
        Guid assetId, IFormFile? file, HttpContext http, ClientCaller caller, DocumentsDbContext db, IDbContextOutbox<DocumentsDbContext> outbox,
        IAssetLookup assets, IFileStore store, Wolverine.IMessageBus bus, TimeProvider clock, CancellationToken ct)
    {
        var asset = await assets.FindAsync(http, assetId, ct);
        if (asset is null) return NoSuchAsset();
        if (asset.CannotEditReason is { } why) return Problems.Conflict(why);
        if (file is null || file.Length == 0) return new FieldErrors().Add("file", "Choose a file to upload.").ToResult();
        if (file.Length > MaxBytes) return new FieldErrors().Add("file", $"This file is {file.Length / (1024 * 1024.0):0.#} MB. Upload files of 25 MB or less.").ToResult();

        var head = new byte[16];
        await using (var peek = file.OpenReadStream())
        {
            _ = await peek.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, ct);
        }

        var contentType = FileKinds.Detect(head);
        if (contentType is null) return new FieldErrors().Add("file", "Upload a PDF or an image (PNG, JPEG or WebP).").ToResult();

        var limit = await db.Limits.SingleOrDefaultAsync(ct);
        if (limit is null)
        {
            // A client from before Documents existed: ask Tenancy for its limits.
            await bus.PublishAsync(new Inventra.Contracts.Shared.ClientLimitsRequested(caller.TenantId, Service, clock.GetUtcNow()));
            return Problems.Conflict("Your company's plan limits are still being loaded into file storage. Try again in a few seconds.");
        }
        var used = await db.Documents.SumAsync(d => (long?)d.SizeBytes, ct) ?? 0;
        if (limit.CannotStoreReason(used, file.Length) is { } full) return Problems.Conflict(full);

        var now = clock.GetUtcNow();
        var document = Document.Create(caller.TenantId, assetId, file.FileName, contentType, file.Length, caller.Info.ActorId, caller.ActorName, now);
        await using (var content = file.OpenReadStream())
        {
            await store.SaveAsync(document.BlobName, content, contentType, ct);
        }

        db.Documents.Add(document);
        await outbox.PublishAsync(caller.Activity(Service, "document.uploaded", "asset", assetId,
            $"Attached {document.FileName} ({document.SizeBytes / 1024.0:N0} KB) to {asset.Tag}.", now));
        await outbox.PublishAsync(new ClientStorageCounted(caller.TenantId, used + document.SizeBytes, now));
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
        }
        catch
        {
            await store.DeleteAsync(document.BlobName, CancellationToken.None); // don't leave an orphaned file behind
            throw;
        }

        return TypedResults.Created($"/documents/{document.Id}", DocumentResponse.From(document));
    }

    internal static async Task<IResult> Link(Guid id, HttpContext http, ClientCaller caller, DocumentsDbContext db, IAssetLookup assets, IFileStore store,
        Wolverine.IMessageBus bus, TimeProvider clock, CancellationToken ct)
    {
        var (document, asset) = await FindAsync(id, http, db, assets, ct);
        if (document is null) return NoSuchDocument();
        var url = await store.DownloadLinkAsync(document.BlobName, document.FileName, LinkLifetime, ct);
        var now = clock.GetUtcNow();
        if (caller.IsSupport)
        {
            await bus.PublishAsync(caller.Activity(Service, "document.opened", "asset", document.AssetId, $"Opened {document.FileName} on {asset!.Tag}.", now));
        }

        return TypedResults.Ok(new DownloadLinkResponse(url.ToString(), now.Add(LinkLifetime)));
    }

    internal static async Task<IResult> Delete(Guid id, HttpContext http, ClientCaller caller, DocumentsDbContext db, IDbContextOutbox<DocumentsDbContext> outbox,
        IAssetLookup assets, IFileStore store, TimeProvider clock, CancellationToken ct)
    {
        var (document, asset) = await FindAsync(id, http, db, assets, ct);
        if (document is null) return NoSuchDocument();
        if (asset!.CannotEditReason is { } why) return Problems.Conflict(why);

        var now = clock.GetUtcNow();
        db.Documents.Remove(document);
        var used = (await db.Documents.SumAsync(d => (long?)d.SizeBytes, ct) ?? 0) - document.SizeBytes;
        await outbox.PublishAsync(caller.Activity(Service, "document.deleted", "asset", document.AssetId, $"Deleted {document.FileName} from {asset.Tag}.", now));
        await outbox.PublishAsync(new ClientStorageCounted(caller.TenantId, Math.Max(0, used), now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        await store.DeleteAsync(document.BlobName, ct);
        return TypedResults.NoContent();
    }

    internal static async Task<IResult> Usage(DocumentsDbContext db, CancellationToken ct)
    {
        var used = await db.Documents.SumAsync(d => (long?)d.SizeBytes, ct) ?? 0;
        var limit = (await db.Limits.SingleOrDefaultAsync(ct))?.LimitBytes ?? 0;
        var ratio = limit <= 0 ? 1d : (double)used / limit;
        return TypedResults.Ok(new StorageUsageResponse(used, limit, ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warn" : "ok"));
    }
}
