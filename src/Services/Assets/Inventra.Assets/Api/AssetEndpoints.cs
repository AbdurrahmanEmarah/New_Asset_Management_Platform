using System.Text.Json.Nodes;
using Inventra.AssetModel;
using Inventra.Assets.Data;
using Inventra.Assets.Domain;
using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Assets;
using Inventra.Contracts.Catalog;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Assets.Api;

/// <summary>
/// The asset register. Site scope comes from Access (through the caller lookup): a person sees and
/// changes only assets at the sites where their role assignments grant the permission; assets with no
/// site need an all-sites grant.
/// </summary>
public static class AssetEndpoints
{
    public const string Service = "assets";
    private const string Read = "assets.read";
    private const string Write = "assets.write";
    private const string Transfer = "assets.transfer";
    private const string Dispose = "assets.dispose";
    private const int MaxDepth = 20;

    public static RouteGroupBuilder MapAssetEndpoints(this RouteGroupBuilder app)
    {
        var assets = app.MapGroup("/assets").WithTags("Assets");
        assets.MapGet("/", List).RequirePermission(Read).Produces<AssetPage>().ProducesValidationProblem()
            .WithSummary("The register, filtered by typeId, siteId, status, parentId and search (tag or name). sort: tag (default), name, status, updated or field:<key> (with typeId); order: asc or desc.");
        assets.MapGet("/{id:guid}", Get).RequirePermission(Read).Produces<AssetResponse>().ProducesProblem(404);
        assets.MapGet("/{id:guid}/children", Children).RequirePermission(Read).Produces<List<AssetSummary>>().ProducesProblem(404);
        assets.MapPost("/", Create).RequirePermission(Write).Produces<AssetResponse>(201).ProducesValidationProblem().ProducesProblem(409);
        assets.MapPut("/{id:guid}", Update).RequirePermission(Write).Produces<AssetResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409);
        assets.MapPost("/{id:guid}/move", Move).RequirePermission(Transfer).Produces<AssetResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409)
            .WithSummary("Moves the asset to another site. Needs \"Transfer between sites\" at both sites.");
        assets.MapPost("/{id:guid}/retire", Retire).RequirePermission(Dispose).Produces<AssetResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409);
        return app;
    }

    private static IQueryable<Asset> Visible(AssetsDbContext db, ClientCaller caller)
    {
        var sites = caller.SitesFor(Read);
        var query = db.Assets.AsQueryable();
        if (sites is not null)
        {
            var allowed = sites.ToList();
            query = query.Where(a => a.SiteId != null && allowed.Contains(a.SiteId.Value));
        }

        return query;
    }

    internal static async Task<IResult> List(
        Guid? typeId, Guid? siteId, string? status, Guid? parentId, string? search, bool? includeRetired, int? page, int? pageSize, string? sort, string? order,
        ClientCaller caller, AssetsDbContext db, CancellationToken ct)
    {
        var query = Visible(db, caller).AsNoTracking();
        AssetTypeCopy? type = null;
        if (typeId is { } t)
        {
            type = await db.Types.AsNoTracking().FirstOrDefaultAsync(x => x.TypeId == t, ct);
            query = query.Where(a => a.TypeId == t);
        }

        if (siteId is { } s) query = query.Where(a => a.SiteId == s);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(a => a.StatusKey == status);
        if (parentId is { } p) query = query.Where(a => a.ParentId == p);
        if (includeRetired != true) query = query.Where(a => a.RetiredAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(a => EF.Functions.ILike(a.Tag, term) || EF.Functions.ILike(a.Name, term));
        }

        var desc = string.Equals(order, "desc", StringComparison.OrdinalIgnoreCase);
        var sortKey = string.IsNullOrWhiteSpace(sort) ? "tag" : sort.Trim();
        IOrderedQueryable<Asset> ordered;
        if (sortKey.StartsWith("field:", StringComparison.Ordinal))
        {
            var field = sortKey["field:".Length..];
            if (type is null || type.Fields.All(f => f.Key != field))
                return new FieldErrors().Add("sort", "Sort by a field only when the list is filtered by one type, and use one of its field keys, e.g. field:serial_number.").ToResult();
            ordered = desc
                ? query.OrderByDescending(a => a.Values.RootElement.GetProperty(field).GetString())
                : query.OrderBy(a => a.Values.RootElement.GetProperty(field).GetString());
        }
        else
        {
            ordered = sortKey switch
            {
                "tag" => desc ? query.OrderByDescending(a => a.Tag) : query.OrderBy(a => a.Tag),
                "name" => desc ? query.OrderByDescending(a => a.Name) : query.OrderBy(a => a.Name),
                "status" => desc ? query.OrderByDescending(a => a.StatusKey) : query.OrderBy(a => a.StatusKey),
                "updated" => desc ? query.OrderByDescending(a => a.UpdatedAt) : query.OrderBy(a => a.UpdatedAt),
                _ => null!,
            };
            if (ordered is null) return new FieldErrors().Add("sort", "Sort by tag, name, status, updated or field:<key>.").ToResult();
        }

        var size = Math.Clamp(pageSize ?? 50, 1, 200);
        var number = Math.Max(page ?? 1, 1);
        var total = await query.CountAsync(ct);
        var rows = await ordered.ThenBy(a => a.Id).Skip((number - 1) * size).Take(size).ToListAsync(ct);
        var types = await TypesAsync(db, rows, ct);
        return TypedResults.Ok(new AssetPage(rows.Select(a => Summary(a, types, withValues: type is not null)).ToList(), total, number, size, type?.Fields));
    }

    internal static async Task<IResult> Get(Guid id, ClientCaller caller, AssetsDbContext db, CancellationToken ct)
    {
        var asset = await Visible(db, caller).AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        return asset is null ? NoSuchAsset() : TypedResults.Ok(await ResponseAsync(asset, caller, db, ct));
    }

    internal static async Task<IResult> Children(Guid id, ClientCaller caller, AssetsDbContext db, CancellationToken ct)
    {
        if (!await Visible(db, caller).AnyAsync(a => a.Id == id, ct)) return NoSuchAsset();
        var rows = await Visible(db, caller).AsNoTracking().Where(a => a.ParentId == id).OrderBy(a => a.Tag).ToListAsync(ct);
        var types = await TypesAsync(db, rows, ct);
        return TypedResults.Ok(rows.Select(a => Summary(a, types, withValues: false)).ToList());
    }

    internal static async Task<IResult> Create(
        CreateAssetRequest request, ClientCaller caller, AssetsDbContext db, IDbContextOutbox<AssetsDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var errors = new RuleErrors();
        if (request.TypeId is null) errors.Add("typeId", "Choose the asset type.");
        CheckName(request.Name, errors);
        if (request.Location?.Trim().Length > Asset.LocationMax) errors.Add("location", $"Use {Asset.LocationMax} characters or fewer.");
        if (errors.Any) return Problems.Validation(errors.ToDictionary());

        var type = await db.Types.FirstOrDefaultAsync(t => t.TypeId == request.TypeId, ct);
        if (type is null)
            return Problems.Conflict("This asset type isn't available yet. If it was just created, try again in a few seconds; otherwise reload the list of types.");
        if (type.CannotAddAssetReason() is { } archived) return Problems.Conflict(archived);
        if (!caller.HasAt(Write, request.SiteId))
            return Problems.Forbidden(request.SiteId is null
                ? "Only people whose role covers every site can add an asset without a site. Choose one of your sites."
                : "You can only add assets at the sites where your role lets you create and edit assets.");

        var limit = await db.Limits.SingleOrDefaultAsync(ct);
        if (limit is null) return Problems.Conflict("Your company's plan limits haven't reached the asset register yet. Try again in a minute.");
        var count = await db.Assets.CountAsync(a => a.RetiredAt == null, ct);
        if (limit.CannotAddReason(count) is { } full) return Problems.Conflict(full);

        var statusKey = string.IsNullOrWhiteSpace(request.StatusKey) ? type.Statuses.FirstOrDefault()?.Key ?? "" : request.StatusKey;
        if (type.Status(statusKey) is null) errors.Add("statusKey", $"Choose one of {type.Name}'s statuses.");
        var now = clock.GetUtcNow();
        var values = AssetValues.Check(type.Fields, request.Values, DateOnly.FromDateTime(now.UtcDateTime), errors);
        await CheckLinksAsync(db, caller, values, request.ParentId, assetId: null, errors, ct);
        if (errors.Any) return Problems.Validation(errors.ToDictionary());

        var asset = Asset.Register(caller.TenantId, type, type.TakeTag(), request.Name!, statusKey, request.SiteId, request.Location ?? "", request.ParentId, values.Values, now);
        db.Assets.Add(asset);
        await outbox.PublishAsync(caller.Activity(Service, "asset.created", "asset", asset.Id, $"Added {asset.Tag} {asset.Name} ({type.Name}).", now));
        await outbox.PublishAsync(new ClientAssetsCounted(caller.TenantId, count + 1, now));
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Problems.Conflict($"Another {type.Name} was added at the same moment, so the tag number was taken. Try again.");
        }

        return TypedResults.Created($"/assets/{asset.Id}", await ResponseAsync(asset, caller, db, ct));
    }

    internal static async Task<IResult> Update(
        Guid id, UpdateAssetRequest request, ClientCaller caller, AssetsDbContext db, IDbContextOutbox<AssetsDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var asset = await Visible(db, caller).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (asset is null) return NoSuchAsset();
        if (!caller.HasAt(Write, asset.SiteId)) return Problems.Forbidden($"You can see {asset.Tag} but your role doesn't let you edit assets at its site.");
        if (asset.CannotChangeReason() is { } why) return Problems.Conflict(why);

        var type = await db.Types.AsNoTracking().FirstAsync(t => t.TypeId == asset.TypeId, ct);
        var errors = new RuleErrors();
        CheckName(request.Name, errors);
        if (request.Location?.Trim().Length > Asset.LocationMax) errors.Add("location", $"Use {Asset.LocationMax} characters or fewer.");
        var statusKey = request.StatusKey ?? asset.StatusKey;
        if (type.Status(statusKey) is null) errors.Add("statusKey", $"Choose one of {type.Name}'s statuses.");
        var now = clock.GetUtcNow();
        var values = AssetValues.Check(type.Fields, request.Values, DateOnly.FromDateTime(now.UtcDateTime), errors);
        await CheckLinksAsync(db, caller, values, request.ParentId, asset.Id, errors, ct);
        if (errors.Any) return Problems.Validation(errors.ToDictionary());

        var statusChanged = statusKey != asset.StatusKey;
        asset.Update(request.Name!, statusKey, request.Location ?? "", request.ParentId, values.Values, type.Fields.Select(f => f.Key), now);
        var details = $"Changed {asset.Tag} {asset.Name}." + (statusChanged ? $" Status: {type.Status(statusKey)!.Label}." : "");
        await outbox.PublishAsync(caller.Activity(Service, "asset.updated", "asset", asset.Id, details, now));
        return await SaveAsync(asset, caller, db, outbox, ct);
    }

    internal static async Task<IResult> Move(
        Guid id, MoveAssetRequest request, ClientCaller caller, AssetsDbContext db, IDbContextOutbox<AssetsDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var asset = await Visible(db, caller).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (asset is null) return NoSuchAsset();
        if (asset.CannotChangeReason() is { } why) return Problems.Conflict(why);
        if (request.Location?.Trim().Length > Asset.LocationMax)
            return new FieldErrors().Add("location", $"Use {Asset.LocationMax} characters or fewer.").ToResult();
        if (!caller.HasAt(Transfer, asset.SiteId) || !caller.HasAt(Transfer, request.SiteId))
            return Problems.Forbidden("You can only move assets between sites where your role lets you transfer assets.");

        var now = clock.GetUtcNow();
        asset.Move(request.SiteId, request.Location ?? "", now);
        await outbox.PublishAsync(caller.Activity(Service, "asset.moved", "asset", asset.Id,
            $"Moved {asset.Tag} to {(request.SiteId is null ? "no site" : $"site {request.SiteId}")}{(string.IsNullOrWhiteSpace(asset.Location) ? "" : $", {asset.Location}")}.", now));
        return await SaveAsync(asset, caller, db, outbox, ct);
    }

    internal static async Task<IResult> Retire(
        Guid id, RetireAssetRequest request, ClientCaller caller, AssetsDbContext db, IDbContextOutbox<AssetsDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 500)
            return new FieldErrors().Add("reason", "Say why the asset is retired (up to 500 characters), e.g. Replaced by PMP-000051.").ToResult();
        var asset = await Visible(db, caller).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (asset is null) return NoSuchAsset();
        if (!caller.HasAt(Dispose, asset.SiteId)) return Problems.Forbidden($"Your role doesn't let you retire assets at {asset.Tag}'s site.");
        var children = await db.Assets.CountAsync(a => a.ParentId == id && a.RetiredAt == null, ct);
        if (asset.CannotRetireReason(children) is { } why) return Problems.Conflict(why);

        var now = clock.GetUtcNow();
        asset.Retire(request.Reason, now);
        var count = await db.Assets.CountAsync(a => a.RetiredAt == null, ct) - 1;
        await outbox.PublishAsync(caller.Activity(Service, "asset.retired", "asset", asset.Id, $"Retired {asset.Tag} {asset.Name}. Reason: {asset.RetiredReason}", now));
        await outbox.PublishAsync(new ClientAssetsCounted(caller.TenantId, Math.Max(0, count), now));
        return await SaveAsync(asset, caller, db, outbox, ct);
    }

    private static async Task<IResult> SaveAsync(Asset asset, ClientCaller caller, AssetsDbContext db, IDbContextOutbox<AssetsDbContext> outbox, CancellationToken ct)
    {
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Problems.Conflict($"Someone else changed {asset.Tag} at the same moment. Reload it and try again.");
        }

        return TypedResults.Ok(await ResponseAsync(asset, caller, db, ct));
    }

    private static void CheckName(string? name, RuleErrors errors)
    {
        if (string.IsNullOrWhiteSpace(name)) errors.Add("name", "Name is required, e.g. Chilled water pump 2.");
        else if (name.Trim().Length > Asset.NameMax) errors.Add("name", $"Use {Asset.NameMax} characters or fewer.");
    }

    /// <summary>The parent must exist and not create a loop; linked assets in "asset" fields must exist.</summary>
    private static async Task CheckLinksAsync(AssetsDbContext db, ClientCaller caller, ValueCheck values, Guid? parentId, Guid? assetId, RuleErrors errors, CancellationToken ct)
    {
        if (parentId is { } parent)
        {
            var current = await db.Assets.AsNoTracking().Where(a => a.Id == parent).Select(a => new { a.Id, a.ParentId, a.RetiredAt }).FirstOrDefaultAsync(ct);
            if (current is null) errors.Add("parentId", "The chosen parent asset doesn't exist. Choose another.");
            else if (current.RetiredAt is not null) errors.Add("parentId", "The chosen parent asset is retired. Choose an asset in use.");
            else
            {
                for (var depth = 0; current is not null; depth++)
                {
                    if (current.Id == assetId)
                    {
                        errors.Add("parentId", "An asset can't sit under itself or one of the assets under it. Choose another parent.");
                        break;
                    }

                    if (depth >= MaxDepth)
                    {
                        errors.Add("parentId", $"The hierarchy can be at most {MaxDepth} levels deep. Choose a parent higher up.");
                        break;
                    }

                    var next = current.ParentId;
                    current = next is null ? null : await db.Assets.AsNoTracking().Where(a => a.Id == next).Select(a => new { a.Id, a.ParentId, a.RetiredAt }).FirstOrDefaultAsync(ct);
                }
            }
        }

        var linked = values.LinkedAssets.Select(l => l.AssetId).Distinct().ToList();
        if (linked.Count == 0) return;
        var found = await db.Assets.Where(a => linked.Contains(a.Id)).Select(a => a.Id).ToListAsync(ct);
        foreach (var (key, id) in values.LinkedAssets.Where(l => !found.Contains(l.AssetId)))
            errors.Add($"values.{key}", "The linked asset doesn't exist. Choose another.");
        _ = caller;
    }

    private static async Task<Dictionary<Guid, AssetTypeCopy>> TypesAsync(AssetsDbContext db, IEnumerable<Asset> assets, CancellationToken ct)
    {
        var ids = assets.Select(a => a.TypeId).Distinct().ToList();
        return await db.Types.AsNoTracking().Where(t => ids.Contains(t.TypeId)).ToDictionaryAsync(t => t.TypeId, ct);
    }

    private static StatusRef StatusOf(AssetTypeCopy? type, string key) =>
        type?.Status(key) is { } s ? new StatusRef(s.Key, s.Label, s.Meaning) : new StatusRef(key, "(removed status)", "none");

    private static AssetSummary Summary(Asset a, IReadOnlyDictionary<Guid, AssetTypeCopy> types, bool withValues)
    {
        types.TryGetValue(a.TypeId, out var type);
        return new AssetSummary(a.Id, a.Tag, a.Name, a.TypeId, type?.Name ?? "", StatusOf(type, a.StatusKey), a.SiteId, a.Location, a.ParentId,
            withValues ? a.ValuesObject() : null, a.UpdatedAt, a.RetiredAt);
    }

    private static async Task<AssetResponse> ResponseAsync(Asset a, ClientCaller caller, AssetsDbContext db, CancellationToken ct)
    {
        var type = await db.Types.AsNoTracking().FirstAsync(t => t.TypeId == a.TypeId, ct);
        var parent = a.ParentId is null ? null
            : await db.Assets.AsNoTracking().Where(p => p.Id == a.ParentId).Select(p => new AssetRef(p.Id, p.Tag, p.Name)).FirstOrDefaultAsync(ct);
        var children = await db.Assets.CountAsync(c => c.ParentId == a.Id && c.RetiredAt == null, ct);

        var all = a.ValuesObject();
        var keys = type.Fields.Select(f => f.Key).ToHashSet(StringComparer.Ordinal);
        var current = new JsonObject();
        var other = new JsonObject();
        foreach (var (key, value) in all) (keys.Contains(key) ? current : other)[key] = value?.DeepClone();

        var cannotEdit = a.CannotChangeReason() ?? (caller.HasAt(Write, a.SiteId) ? null : "Your role doesn't let you edit assets at this site.");
        var cannotMove = a.CannotChangeReason() ?? (caller.HasAt(Transfer, a.SiteId) ? null : "Your role doesn't let you move assets from this site.");
        var cannotRetire = a.CannotRetireReason(children) ?? (caller.HasAt(Dispose, a.SiteId) ? null : "Your role doesn't let you retire assets at this site.");
        return new AssetResponse(a.Id, a.Tag, a.Name, a.TypeId, type.Name, type.Version, type.Fields, type.Statuses, StatusOf(type, a.StatusKey),
            a.SiteId, a.Location, parent, children, current, other, a.CreatedAt, a.UpdatedAt, a.RetiredAt, a.RetiredReason, cannotEdit, cannotMove, cannotRetire);
    }

    private static IResult NoSuchAsset() => Problems.NotFound("No asset has this id, or it's at a site your role doesn't cover.");
}
