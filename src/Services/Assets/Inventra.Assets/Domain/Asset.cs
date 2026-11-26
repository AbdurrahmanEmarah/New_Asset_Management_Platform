using System.Text.Json;
using System.Text.Json.Nodes;
using Inventra.Contracts.Catalog;

namespace Inventra.Assets.Domain;

/// <summary>One asset in a client's register.</summary>
public sealed class Asset
{
    public const int NameMax = 160;
    public const int LocationMax = 200;

    private Asset() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid TypeId { get; private set; }

    /// <summary>The type's prefix plus a number per type, e.g. PMP-000042. Never changes.</summary>
    public string Tag { get; private set; } = "";
    public string Name { get; private set; } = "";
    public string StatusKey { get; private set; } = "";

    /// <summary>An Access site, or null for "no site" (only all-sites roles see those).</summary>
    public Guid? SiteId { get; private set; }

    /// <summary>Where inside the site, as free text for now (e.g. "Plant room 2").</summary>
    public string Location { get; private set; } = "";
    public Guid? ParentId { get; private set; }

    /// <summary>Field values by field key. Keys of fields removed from the type stay, so old values remain readable.</summary>
    public JsonDocument Values { get; private set; } = JsonDocument.Parse("{}");

    /// <summary>A copy of the values to read or edit.</summary>
    public JsonObject ValuesObject() => JsonNode.Parse(Values.RootElement.GetRawText())!.AsObject();
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? RetiredAt { get; private set; }
    public string? RetiredReason { get; private set; }

    public static Asset Register(Guid tenantId, AssetTypeCopy type, string tag, string name, string statusKey, Guid? siteId, string location,
        Guid? parentId, JsonObject values, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        TypeId = type.TypeId,
        Tag = tag,
        Name = name.Trim(),
        StatusKey = statusKey,
        SiteId = siteId,
        Location = location.Trim(),
        ParentId = parentId,
        Values = JsonSerializer.SerializeToDocument(values),
        CreatedAt = now,
        UpdatedAt = now,
    };

    public string? CannotChangeReason() => RetiredAt is null ? null : $"{Tag} is retired, so it can't be changed.";

    /// <summary>Updates the asset. Values for the type's current fields are replaced; values of removed fields are kept.</summary>
    public void Update(string name, string statusKey, string location, Guid? parentId, JsonObject currentValues, IEnumerable<string> currentKeys, DateTimeOffset now)
    {
        var keep = new JsonObject();
        var current = currentKeys.ToHashSet(StringComparer.Ordinal);
        foreach (var (key, value) in ValuesObject())
        {
            if (!current.Contains(key)) keep[key] = value?.DeepClone();
        }

        foreach (var (key, value) in currentValues) keep[key] = value?.DeepClone();
        Name = name.Trim();
        StatusKey = statusKey;
        Location = location.Trim();
        ParentId = parentId;
        Values = JsonSerializer.SerializeToDocument(keep);
        UpdatedAt = now;
    }

    public void Move(Guid? siteId, string location, DateTimeOffset now)
    {
        SiteId = siteId;
        Location = location.Trim();
        UpdatedAt = now;
    }

    public string? CannotRetireReason(int activeChildren) =>
        RetiredAt is not null ? $"{Tag} is already retired."
        : activeChildren > 0 ? $"{Tag} has {activeChildren} asset(s) under it. Move or retire them first."
        : null;

    public void Retire(string reason, DateTimeOffset now)
    {
        RetiredAt = now;
        RetiredReason = reason.Trim();
        UpdatedAt = now;
    }
}

/// <summary>Assets' copy of a Catalog asset type (latest version), plus the next tag number.</summary>
public sealed class AssetTypeCopy
{
    private AssetTypeCopy() { }

    public Guid TypeId { get; private set; }
    public Guid TenantId { get; private set; }
    public int Version { get; private set; }
    public string Name { get; private set; } = "";
    public string TagPrefix { get; private set; } = "";
    public string IconKey { get; private set; } = "";
    public List<FieldDefinition> Fields { get; private set; } = [];
    public List<StatusDefinition> Statuses { get; private set; } = [];
    public bool Archived { get; private set; }

    public static AssetTypeCopy From(AssetTypePublished e) => new AssetTypeCopy { TypeId = e.TypeId, TenantId = e.ClientId }.Apply(e);

    /// <summary>Applies a newer version; older or repeated ones are ignored.</summary>
    public bool TryApply(AssetTypePublished e)
    {
        if (e.Version <= Version) return false;
        Apply(e);
        return true;
    }

    private AssetTypeCopy Apply(AssetTypePublished e)
    {
        Version = e.Version;
        Name = e.Name;
        TagPrefix = e.TagPrefix;
        IconKey = e.IconKey;
        Fields = [.. e.Fields.OrderBy(f => f.Order)];
        Statuses = [.. e.Statuses.OrderBy(s => s.Order)];
        Archived = e.Archived;
        return this;
    }

    public string? CannotAddAssetReason() => Archived ? $"{Name} is archived, so no new assets of this type can be added. Restore it in Settings › Asset types." : null;

    /// <summary>The tag for a number taken from the type's counter (<see cref="TagCounter"/>), e.g. PMP-000042.</summary>
    public string TagFor(int number) => $"{TagPrefix}-{number:D6}";

    public StatusDefinition? Status(string key) => Statuses.FirstOrDefault(s => s.Key == key);
}

/// <summary>Assets' copy of an Access site, kept in step by SiteCreated / SiteUpdated.</summary>
public sealed class SiteCopy
{
    private SiteCopy() { }

    public Guid SiteId { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = "";
    public string Code { get; private set; } = "";
    public bool IsActive { get; private set; }
    public DateTimeOffset ChangedAt { get; private set; }

    public static SiteCopy Create(Guid tenantId, Guid siteId) => new() { TenantId = tenantId, SiteId = siteId, ChangedAt = DateTimeOffset.MinValue };

    public bool TryApply(string name, string code, bool active, DateTimeOffset at)
    {
        if (at < ChangedAt) return false;
        (Name, Code, IsActive, ChangedAt) = (name, code, active, at);
        return true;
    }

    public string? CannotPlaceAssetsReason() => IsActive ? null : $"{Name} isn't an active site. Ask your Admin to turn it back on, or choose another site.";
}

/// <summary>
/// The next tag number of one asset type. Taken with one atomic statement inside the create's
/// transaction, so parallel creates queue on this row and never get the same number.
/// </summary>
public sealed class TagCounter
{
    private TagCounter() { }

    public Guid TypeId { get; private set; }
    public Guid TenantId { get; private set; }
    public int NextNumber { get; private set; }
}

/// <summary>The client's plan limit for assets, from Tenancy's events.</summary>
public sealed class ClientLimit
{
    private ClientLimit() { }

    public Guid TenantId { get; private set; }
    public int MaxAssets { get; private set; }
    public DateTimeOffset ChangedAt { get; private set; }

    /// <summary>When Assets asked Access for this client's sites (backfill). A client created after site sync needs none.</summary>
    public DateTimeOffset? SitesRequestedAt { get; private set; }

    public static ClientLimit Create(Guid tenantId, int maxAssets, DateTimeOffset at, bool newClient) =>
        new() { TenantId = tenantId, MaxAssets = maxAssets, ChangedAt = at, SitesRequestedAt = newClient ? at : null };

    public bool NeedsSites => SitesRequestedAt is null;

    public void SitesRequested(DateTimeOffset at) => SitesRequestedAt = at;

    public bool TryChange(int maxAssets, DateTimeOffset at)
    {
        if (at < ChangedAt) return false;
        MaxAssets = maxAssets;
        ChangedAt = at;
        return true;
    }

    /// <summary>"ok" below 80% of the plan's assets, "warn" from 80%, "blocked" at 100% (the same rule the create check uses).</summary>
    public string UsageState(int assets)
    {
        var ratio = MaxAssets <= 0 ? 1d : (double)assets / MaxAssets;
        return ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warn" : "ok";
    }

    /// <summary>Why one more asset can't be added, or null. Blocks at 100% of the plan.</summary>
    public string? CannotAddReason(int assets) => UsageState(assets) == "blocked"
        ? $"Your plan allows {MaxAssets:N0} assets and all {MaxAssets:N0} are in use. Retire assets you no longer need, or ask your Owner about a bigger plan."
        : null;
}
