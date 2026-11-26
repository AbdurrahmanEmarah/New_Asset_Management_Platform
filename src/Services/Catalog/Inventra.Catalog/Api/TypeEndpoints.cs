using Inventra.AssetModel;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Inventra.Catalog.Data;
using Inventra.Catalog.Domain;
using Inventra.Contracts.Catalog;
using Inventra.Contracts.Shared;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Catalog.Api;

public static class TypeEndpoints
{
    public const string Service = "catalog";
    private const string Read = "assets.read";
    private const string Manage = "settings.manage";

    public static RouteGroupBuilder MapTypeEndpoints(this RouteGroupBuilder app)
    {
        var types = app.MapGroup("/types").WithTags("Asset types");
        types.MapGet("/", ListTypes).RequirePermission(Read, Manage).Produces<List<AssetTypeResponse>>()
            .WithSummary("The company's asset types. Archived ones only with includeArchived=true.");
        types.MapGet("/{id:guid}", GetAssetType).RequirePermission(Read, Manage).Produces<AssetTypeResponse>().ProducesProblem(404);
        types.MapPost("/", CreateType).RequirePermission(Manage).Produces<AssetTypeResponse>(201).ProducesValidationProblem();
        types.MapPost("/from-template", CreateFromTemplate).RequirePermission(Manage).Produces<AssetTypeResponse>(201)
            .ProducesValidationProblem().ProducesProblem(404).WithSummary("\"Add from template library\": copies a template into the company.");
        types.MapPut("/{id:guid}", UpdateType).RequirePermission(Manage).Produces<AssetTypeResponse>()
            .ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409)
            .WithSummary("Replaces the type. Send the version you started from; a newer version answers 409.");
        types.MapPost("/{id:guid}/archive", Archive).RequirePermission(Manage).Produces<AssetTypeResponse>().ProducesProblem(404).ProducesProblem(409)
            .WithSummary("Stops new assets of this type. Existing assets keep it.");
        types.MapPost("/{id:guid}/restore", Restore).RequirePermission(Manage).Produces<AssetTypeResponse>().ProducesProblem(404).ProducesProblem(409);

        app.MapGet("/templates", (CatalogDbContext db, CancellationToken ct) => ListTemplatesAsync(db, ct))
            .WithTags("Template library").RequirePermission(Manage).Produces<List<TemplateResponse>>();
        return app;
    }

    internal static async Task<IResult> ListTemplatesAsync(CatalogDbContext db, CancellationToken ct) =>
        TypedResults.Ok((await db.Templates.AsNoTracking().OrderBy(t => t.Category).ThenBy(t => t.Name).ToListAsync(ct))
            .Select(TemplateResponse.From).ToList());

    internal static async Task<IResult> ListTypes(bool? includeArchived, CatalogDbContext db, CancellationToken ct)
    {
        var query = db.Types.AsNoTracking();
        if (includeArchived != true) query = query.Where(t => !t.IsArchived);
        return TypedResults.Ok((await query.OrderBy(t => t.Name).ToListAsync(ct)).Select(AssetTypeResponse.From).ToList());
    }

    internal static async Task<IResult> GetAssetType(Guid id, CatalogDbContext db, CancellationToken ct) =>
        await db.Types.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct) is { } type
            ? TypedResults.Ok(AssetTypeResponse.From(type))
            : NoSuchType();

    internal static async Task<IResult> CreateType(
        AssetTypeRequest request, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var (definition, errors) = Definitions.Build(request.Name, request.TagPrefix, request.IconKey, request.Fields, request.Statuses, existing: null);
        if (errors.Any) return Problems.Validation(errors.ToDictionary());
        if (await TakenAsync(db, request.Name!, request.TagPrefix!, null, ct) is { } taken) return taken;

        var now = clock.GetUtcNow();
        var type = AssetType.Create(caller.TenantId, request.Name!, request.TagPrefix!, request.IconKey ?? "", definition.Fields, definition.Statuses, null, now);
        db.Types.Add(type);
        return await SaveAsync(type, caller, db, outbox, "asset_type.created",
            $"Created asset type {type.Name} ({type.TagPrefix}) with {type.Fields.Count} fields.", now, created: true, ct);
    }

    internal static async Task<IResult> CreateFromTemplate(
        FromTemplateRequest request, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var template = string.IsNullOrWhiteSpace(request.TemplateKey) ? null : await db.Templates.AsNoTracking().FirstOrDefaultAsync(t => t.Key == request.TemplateKey, ct);
        if (template is null) return Problems.NotFound("That template isn't in the library any more. Reload the library and choose again.");

        var name = string.IsNullOrWhiteSpace(request.Name) ? template.Name : request.Name.Trim();
        var prefix = string.IsNullOrWhiteSpace(request.TagPrefix) ? template.TagPrefix : request.TagPrefix;
        var errors = new RuleErrors();
        if (name.Length > AssetType.NameMax) errors.Add("name", $"Use {AssetType.NameMax} characters or fewer.");
        if (AssetType.PrefixProblem(prefix) is { } prefixProblem) errors.Add("tagPrefix", prefixProblem);
        if (errors.Any) return Problems.Validation(errors.ToDictionary());
        if (await TakenAsync(db, name, prefix, null, ct) is { } taken) return taken;

        var now = clock.GetUtcNow();
        var type = AssetType.Create(caller.TenantId, name, prefix, template.IconKey, template.Fields, template.Statuses, template.Key, now);
        db.Types.Add(type);
        return await SaveAsync(type, caller, db, outbox, "asset_type.created",
            $"Added asset type {type.Name} ({type.TagPrefix}) from the template \"{template.Name}\".", now, created: true, ct);
    }

    internal static async Task<IResult> UpdateType(
        Guid id, AssetTypeRequest request, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var type = await db.Types.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NoSuchType();
        if (request.Version is null) return new FieldErrors().Add("version", "Send the version of the type you started editing.").ToResult();

        var (definition, errors) = Definitions.Build(request.Name, request.TagPrefix, request.IconKey, request.Fields, request.Statuses, type);
        if (errors.Any) return Problems.Validation(errors.ToDictionary());
        if (type.CannotUpdateReason(request.Version.Value, definition.Fields) is { } why) return Problems.Conflict(why);
        if (await TakenAsync(db, request.Name!, request.TagPrefix!, id, ct) is { } taken) return taken;

        var before = type.Fields.Select(f => f.Key).ToHashSet();
        var now = clock.GetUtcNow();
        type.Update(request.Name!, request.TagPrefix!, request.IconKey ?? type.IconKey, definition.Fields, definition.Statuses, now);
        var added = type.Fields.Where(f => !before.Contains(f.Key)).Select(f => f.Label).ToList();
        var removed = before.Except(type.Fields.Select(f => f.Key)).ToList();
        var details = $"Changed asset type {type.Name} (version {type.Version})."
                      + (added.Count > 0 ? $" Added {string.Join(", ", added)}." : "")
                      + (removed.Count > 0 ? $" Removed {string.Join(", ", removed)} (existing values stay readable)." : "");
        return await SaveAsync(type, caller, db, outbox, "asset_type.updated", details, now, created: false, ct);
    }

    internal static async Task<IResult> Archive(Guid id, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var type = await db.Types.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NoSuchType();
        if (type.CannotArchiveReason() is { } why) return Problems.Conflict(why);
        var now = clock.GetUtcNow();
        type.Archive(now);
        return await SaveAsync(type, caller, db, outbox, "asset_type.archived", $"Archived asset type {type.Name}. No new assets of this type can be added.", now, false, ct);
    }

    internal static async Task<IResult> Restore(Guid id, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var type = await db.Types.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (type is null) return NoSuchType();
        if (type.CannotRestoreReason() is { } why) return Problems.Conflict(why);
        var now = clock.GetUtcNow();
        type.Restore(now);
        return await SaveAsync(type, caller, db, outbox, "asset_type.restored", $"Restored asset type {type.Name}.", now, false, ct);
    }

    /// <summary>Saves the type, its audit entry and the AssetTypePublished event in one transaction.</summary>
    private static async Task<IResult> SaveAsync(AssetType type, ClientCaller caller, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox,
        string action, string details, DateTimeOffset now, bool created, CancellationToken ct)
    {
        await outbox.PublishAsync(new AssetTypePublished(type.TenantId, type.Id, type.Version, type.Name, type.TagPrefix, type.IconKey,
            type.Fields, type.Statuses, type.IsArchived, now));
        await outbox.PublishAsync(caller.Activity(Service, action, "asset_type", type.Id, details, now));
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(CatalogDbContext.PrefixIndex))
        {
            return PrefixTaken(type.TagPrefix);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(CatalogDbContext.NameIndex))
        {
            return NameTaken(type.Name);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Problems.Conflict($"Someone else changed {type.Name} at the same moment. Reload it and make your changes again.");
        }

        var response = AssetTypeResponse.From(type);
        return created ? TypedResults.Created($"/types/{type.Id}", response) : TypedResults.Ok(response);
    }

    private static async Task<IResult?> TakenAsync(CatalogDbContext db, string name, string prefix, Guid? excluding, CancellationToken ct)
    {
        var normalized = AssetType.NormalizePrefix(prefix);
        if (await db.Types.AnyAsync(t => t.TagPrefix == normalized && t.Id != excluding, ct)) return PrefixTaken(normalized);
        if (await db.Types.AnyAsync(t => t.Name == name.Trim() && t.Id != excluding, ct)) return NameTaken(name.Trim());
        return null;
    }

    private static IResult PrefixTaken(string prefix) =>
        new FieldErrors().Add("tagPrefix", $"Another asset type already uses the prefix {prefix}. Choose another, so tags stay unique.").ToResult();

    private static IResult NameTaken(string name) =>
        new FieldErrors().Add("name", $"An asset type called \"{name}\" already exists. Choose another name.").ToResult();

    private static IResult NoSuchType() => Problems.NotFound("No asset type has this id in your company. It may have been removed.");
}

/// <summary>Turns the editor's fields and statuses into definitions, keeping existing keys and checking every rule.</summary>
internal static class Definitions
{
    public sealed record Definition(List<FieldDefinition> Fields, List<StatusDefinition> Statuses);

    public static (Definition Definition, RuleErrors Errors) Build(
        string? name, string? tagPrefix, string? iconKey, IReadOnlyList<FieldRequest>? fields, IReadOnlyList<StatusRequest>? statuses, AssetType? existing)
    {
        var errors = new RuleErrors();
        if (string.IsNullOrWhiteSpace(name)) errors.Add("name", "Name is required, e.g. Pump.");
        else if (name.Trim().Length > AssetType.NameMax) errors.Add("name", $"Use {AssetType.NameMax} characters or fewer.");
        if (AssetType.PrefixProblem(tagPrefix) is { } prefixProblem) errors.Add("tagPrefix", prefixProblem);
        if (iconKey?.Trim().Length > 32) errors.Add("iconKey", "Use an icon key of 32 characters or fewer.");

        var usedKeys = new HashSet<string>((fields ?? []).Where(f => !string.IsNullOrWhiteSpace(f.Key)).Select(f => f.Key!), StringComparer.Ordinal);
        var builtFields = new List<FieldDefinition>();
        for (var i = 0; i < (fields?.Count ?? 0); i++)
        {
            var f = fields![i];
            var kind = ParseKind(f.Kind);
            if (kind is null) errors.Add($"fields[{i}].kind", "Choose a kind: text, number, date, choice, person, asset or file.");
            var key = string.IsNullOrWhiteSpace(f.Key) ? FreeKey(f.Label ?? $"field {i + 1}", usedKeys) : f.Key!.Trim();
            builtFields.Add(new FieldDefinition(key, f.Label ?? "", kind ?? FieldKind.Text, f.Required, i, f.Rules ?? new FieldRules()));
        }

        var statusKeys = new HashSet<string>((statuses ?? []).Where(s => !string.IsNullOrWhiteSpace(s.Key)).Select(s => s.Key!), StringComparer.Ordinal);
        var builtStatuses = (statuses ?? []).Select((s, i) => new StatusDefinition(
            string.IsNullOrWhiteSpace(s.Key) ? FreeKey(s.Label ?? $"status {i + 1}", statusKeys) : s.Key!.Trim(),
            s.Label ?? "", s.Meaning?.Trim().ToLowerInvariant() ?? "", i)).ToList();

        AssetTypeRules.CheckFields(builtFields, errors);
        AssetTypeRules.CheckStatuses(builtStatuses, errors);
        _ = existing;
        return (new Definition(builtFields, builtStatuses), errors);
    }

    private static FieldKind? ParseKind(string? kind) =>
        Enum.TryParse<FieldKind>(kind?.Trim(), ignoreCase: true, out var k) && Enum.IsDefined(k) && !int.TryParse(kind, out _) ? k : null;

    private static string FreeKey(string label, HashSet<string> used)
    {
        var baseKey = AssetTypeRules.KeyFromLabel(label);
        var key = baseKey;
        for (var n = 2; !used.Add(key); n++) key = $"{baseKey}_{n}";
        return key;
    }
}

public static class PlatformTemplateEndpoints
{
    public static IEndpointRouteBuilder MapPlatformTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/platform/templates").WithTags("Template library (platform)").RequireAuthorization(PlatformPolicies.Read);
        group.MapGet("/", (CatalogDbContext db, CancellationToken ct) => TypeEndpoints.ListTemplatesAsync(db, ct)).Produces<List<TemplateResponse>>();
        group.MapPut("/{key}", Save).RequireAuthorization(PlatformPolicies.ManageClients).Produces<TemplateResponse>()
            .ProducesValidationProblem().WithSummary("Creates or replaces a template. Clients' types copied from it don't change.");
        group.MapDelete("/{key}", Delete).RequireAuthorization(PlatformPolicies.ManageClients).Produces(204).ProducesProblem(404);
        return app;
    }

    internal static async Task<IResult> Save(string key, TemplateRequest request, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox,
        ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        var (definition, errors) = Definitions.Build(request.Name, request.TagPrefix, request.IconKey, request.Fields, request.Statuses, null);
        if (AssetTypeRules.KeyProblem(key) is { } keyProblem) errors.Add("key", keyProblem);
        if (request.Description?.Length > 300) errors.Add("description", "Use 300 characters or fewer.");
        if (request.Category?.Length > 60) errors.Add("category", "Use 60 characters or fewer.");
        if (errors.Any) return Problems.Validation(errors.ToDictionary());

        var template = await db.Templates.FirstOrDefaultAsync(t => t.Key == key, ct);
        if (template is null)
        {
            template = new AssetTemplate { Key = key, Name = "", TagPrefix = "" };
            db.Templates.Add(template);
        }

        template.Name = request.Name!.Trim();
        template.Description = request.Description?.Trim() ?? "";
        template.Category = request.Category?.Trim() ?? "";
        template.TagPrefix = AssetType.NormalizePrefix(request.TagPrefix!);
        template.IconKey = request.IconKey?.Trim() ?? "";
        template.Fields = definition.Fields;
        template.Statuses = definition.Statuses;
        template.UpdatedAt = clock.GetUtcNow();
        await outbox.PublishAsync(new PlatformChangeRecorded(TypeEndpoints.Service, user.Id, user.Name, "template.saved",
            $"Saved template \"{template.Name}\" ({key}) with {template.Fields.Count} fields.", template.UpdatedAt));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.Ok(TemplateResponse.From(template));
    }

    internal static async Task<IResult> Delete(string key, CatalogDbContext db, IDbContextOutbox<CatalogDbContext> outbox,
        ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        var template = await db.Templates.FirstOrDefaultAsync(t => t.Key == key, ct);
        if (template is null) return Problems.NotFound("No template has this key.");
        db.Templates.Remove(template);
        await outbox.PublishAsync(new PlatformChangeRecorded(TypeEndpoints.Service, user.Id, user.Name, "template.deleted",
            $"Deleted template \"{template.Name}\" ({key}). Clients' types copied from it are unchanged.", clock.GetUtcNow()));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.NoContent();
    }
}
