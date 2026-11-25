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
    public int NextNumber { get; private set; } = 1;

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

    /// <summary>Takes the next tag, e.g. PMP-000042. Saved with the asset, so a number is never used twice.</summary>
    public string TakeTag() => $"{TagPrefix}-{NextNumber++:D6}";

    public StatusDefinition? Status(string key) => Statuses.FirstOrDefault(s => s.Key == key);
}

/// <summary>The client's plan limit for assets, from Tenancy's events.</summary>
public sealed class ClientLimit
{
    private ClientLimit() { }

    public Guid TenantId { get; private set; }
    public int MaxAssets { get; private set; }
    public DateTimeOffset ChangedAt { get; private set; }

    public static ClientLimit Create(Guid tenantId, int maxAssets, DateTimeOffset at) => new() { TenantId = tenantId, MaxAssets = maxAssets, ChangedAt = at };

    public bool TryChange(int maxAssets, DateTimeOffset at)
    {
        if (at < ChangedAt) return false;
        MaxAssets = maxAssets;
        ChangedAt = at;
        return true;
    }

    /// <summary>Why one more asset can't be added, or null. Blocks at 100% of the plan.</summary>
    public string? CannotAddReason(int assets) => assets >= MaxAssets
        ? $"Your plan allows {MaxAssets:N0} assets and all {MaxAssets:N0} are in use. Retire assets you no longer need, or ask your Owner about a bigger plan."
        : null;
}
