using System.Text.RegularExpressions;
using Inventra.Contracts.Catalog;

namespace Inventra.Catalog.Domain;

/// <summary>A kind of asset a client manages (e.g. Pump, Vehicle), with its fields and statuses as data.</summary>
public sealed partial class AssetType
{
    public const int NameMax = 80;

    private AssetType() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = "";

    /// <summary>Starts every tag of this type, e.g. PMP in PMP-000042. Upper case, unique per client.</summary>
    public string TagPrefix { get; private set; } = "";
    public string IconKey { get; private set; } = "";
    public List<FieldDefinition> Fields { get; private set; } = [];
    public List<StatusDefinition> Statuses { get; private set; } = [];

    /// <summary>Goes up by one with every change. Edits send the version they started from.</summary>
    public int Version { get; private set; }

    /// <summary>The template it was copied from, if any.</summary>
    public string? TemplateKey { get; private set; }
    public bool IsArchived { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public static AssetType Create(Guid tenantId, string name, string tagPrefix, string iconKey,
        IEnumerable<FieldDefinition> fields, IEnumerable<StatusDefinition> statuses, string? templateKey, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        Name = name.Trim(),
        TagPrefix = NormalizePrefix(tagPrefix),
        IconKey = iconKey.Trim(),
        Fields = Ordered(fields),
        Statuses = Ordered(statuses),
        Version = 1,
        TemplateKey = templateKey,
        CreatedAt = now,
        UpdatedAt = now,
    };

    /// <summary>Why the type can't be changed this way, or null. A field's kind can't change once it exists.</summary>
    public string? CannotUpdateReason(int fromVersion, IEnumerable<FieldDefinition> fields)
    {
        if (IsArchived) return $"{Name} is archived. Restore it before changing it.";
        if (fromVersion != Version)
            return $"Someone else changed {Name} while you were editing (it is now at version {Version}). Reload it and make your changes again.";
        var existing = Fields.ToDictionary(f => f.Key, StringComparer.Ordinal);
        foreach (var f in fields)
        {
            if (existing.TryGetValue(f.Key, out var old) && old.Kind != f.Kind)
                return $"\"{old.Label}\" is a {old.Kind.ToString().ToLowerInvariant()} field and can't become a {f.Kind.ToString().ToLowerInvariant()} field, because existing values wouldn't fit. Add a new field instead.";
        }

        return null;
    }

    public void Update(string name, string tagPrefix, string iconKey, IEnumerable<FieldDefinition> fields, IEnumerable<StatusDefinition> statuses, DateTimeOffset now)
    {
        Name = name.Trim();
        TagPrefix = NormalizePrefix(tagPrefix);
        IconKey = iconKey.Trim();
        Fields = Ordered(fields);
        Statuses = Ordered(statuses);
        Touch(now);
    }

    public string? CannotArchiveReason() => IsArchived ? $"{Name} is already archived." : null;

    public string? CannotRestoreReason() => IsArchived ? null : $"{Name} isn't archived.";

    public void Archive(DateTimeOffset now)
    {
        IsArchived = true;
        Touch(now);
    }

    public void Restore(DateTimeOffset now)
    {
        IsArchived = false;
        Touch(now);
    }

    private void Touch(DateTimeOffset now)
    {
        Version++;
        UpdatedAt = now;
    }

    public static string NormalizePrefix(string prefix) => prefix.Trim().ToUpperInvariant();

    /// <summary>The problem with a tag prefix, or null.</summary>
    public static string? PrefixProblem(string? prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix)) return "Tag prefix is required, e.g. PMP for pumps.";
        return PrefixPattern().IsMatch(NormalizePrefix(prefix)) ? null : "Use 2 to 8 letters or numbers, starting with a letter, e.g. PMP.";
    }

    [GeneratedRegex("^[A-Z][A-Z0-9]{1,7}$")]
    private static partial Regex PrefixPattern();

    private static List<FieldDefinition> Ordered(IEnumerable<FieldDefinition> fields) =>
        fields.Select((f, i) => f with { Label = f.Label.Trim(), Order = i }).ToList();

    private static List<StatusDefinition> Ordered(IEnumerable<StatusDefinition> statuses) =>
        statuses.Select((s, i) => s with { Label = s.Label.Trim(), Order = i }).ToList();
}

/// <summary>A preset from the platform's template library. Clients copy it into their own types.</summary>
public sealed class AssetTemplate
{
    public required string Key { get; init; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public required string TagPrefix { get; set; }
    public string IconKey { get; set; } = "";
    public List<FieldDefinition> Fields { get; set; } = [];
    public List<StatusDefinition> Statuses { get; set; } = [];
    public DateTimeOffset UpdatedAt { get; set; }
}
