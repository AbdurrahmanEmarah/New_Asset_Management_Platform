namespace Inventra.Contracts.Catalog;

/// <summary>The kinds of field an asset type can have.</summary>
public enum FieldKind
{
    Text,
    /// <summary>A number, with an optional unit (Rules.Unit).</summary>
    Number,
    Date,
    /// <summary>One (or, with Rules.Multiple, several) of Rules.Options.</summary>
    Choice,
    /// <summary>A person in the client: an Access user id.</summary>
    Person,
    /// <summary>A link to another asset: an asset id.</summary>
    Asset,
    /// <summary>A document attached to the asset: a Documents id.</summary>
    File,
}

/// <summary>Validation rules for one field. Only the rules that fit the field's kind are used.</summary>
public sealed record FieldRules(
    int? MinLength = null,
    int? MaxLength = null,
    string? Pattern = null,
    string? PatternHint = null,
    decimal? Min = null,
    decimal? Max = null,
    int? Decimals = null,
    string? Unit = null,
    IReadOnlyList<string>? Options = null,
    bool Multiple = false,
    bool NotInFuture = false);

/// <summary>One field of an asset type. Key is stable (asset values are stored under it); Label can change.</summary>
public sealed record FieldDefinition(string Key, string Label, FieldKind Kind, bool Required, int Order, FieldRules Rules);

/// <summary>A status of an asset type. Meaning is one of ok, warn, fault, info, none (colour and shape in the apps).</summary>
public sealed record StatusDefinition(string Key, string Label, string Meaning, int Order);

/// <summary>
/// An asset type was created or changed (published by Catalog). Assets keeps a copy of the latest
/// version, so it validates values without calling Catalog. Archived types take no new assets.
/// </summary>
public sealed record AssetTypePublished(
    Guid ClientId,
    Guid TypeId,
    int Version,
    string Name,
    string TagPrefix,
    string IconKey,
    IReadOnlyList<FieldDefinition> Fields,
    IReadOnlyList<StatusDefinition> Statuses,
    bool Archived,
    DateTimeOffset OccurredAt);
