using Inventra.Catalog.Domain;
using Inventra.Contracts.Catalog;

namespace Inventra.Catalog.Api;

/// <summary>
/// A field as the editor sends it. Leave Key empty for a new field (it is made from the label); keep
/// the key of an existing field, since values are stored under it. Kind: text, number, date, choice,
/// person, asset or file.
/// </summary>
public sealed record FieldRequest(string? Key, string? Label, string? Kind, bool Required, FieldRules? Rules);

/// <summary>A status as the editor sends it. Meaning: ok, warn, fault, info or none. Leave Key empty for a new status.</summary>
public sealed record StatusRequest(string? Key, string? Label, string? Meaning);

public sealed record AssetTypeRequest(
    string? Name, string? TagPrefix, string? IconKey, IReadOnlyList<FieldRequest>? Fields, IReadOnlyList<StatusRequest>? Statuses,
    int? Version);

/// <summary>Copies a template into the company. Name and TagPrefix default to the template's.</summary>
public sealed record FromTemplateRequest(string? TemplateKey, string? Name, string? TagPrefix);

public sealed record TemplateRequest(
    string? Name, string? Description, string? Category, string? TagPrefix, string? IconKey,
    IReadOnlyList<FieldRequest>? Fields, IReadOnlyList<StatusRequest>? Statuses);

public sealed record AssetTypeResponse(
    Guid Id,
    string Name,
    string TagPrefix,
    string IconKey,
    IReadOnlyList<FieldDefinition> Fields,
    IReadOnlyList<StatusDefinition> Statuses,
    int Version,
    string? TemplateKey,
    bool IsArchived,
    DateTimeOffset UpdatedAt)
{
    public static AssetTypeResponse From(AssetType t) =>
        new(t.Id, t.Name, t.TagPrefix, t.IconKey, t.Fields, t.Statuses, t.Version, t.TemplateKey, t.IsArchived, t.UpdatedAt);
}

public sealed record TemplateResponse(
    string Key, string Name, string Description, string Category, string TagPrefix, string IconKey,
    IReadOnlyList<FieldDefinition> Fields, IReadOnlyList<StatusDefinition> Statuses, DateTimeOffset UpdatedAt)
{
    public static TemplateResponse From(AssetTemplate t) =>
        new(t.Key, t.Name, t.Description, t.Category, t.TagPrefix, t.IconKey, t.Fields, t.Statuses, t.UpdatedAt);
}
