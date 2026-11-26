using System.Text.Json.Nodes;
using Inventra.Contracts.Catalog;

namespace Inventra.Assets.Api;

/// <summary>Values is an object keyed by field key, e.g. { "serial_number": "AB-1234", "flow_rate": 12.5 }. StatusKey defaults to the type's first status.</summary>
public sealed record CreateAssetRequest(Guid? TypeId, string? Name, string? StatusKey, Guid? SiteId, string? Location, Guid? ParentId, JsonObject? Values);

/// <summary>Replaces the editable parts. Values for fields not sent are cleared; values of fields removed from the type are kept.</summary>
public sealed record UpdateAssetRequest(string? Name, string? StatusKey, string? Location, Guid? ParentId, JsonObject? Values);

/// <summary>Moves the asset to another site (or to no site, with SiteId null).</summary>
public sealed record MoveAssetRequest(Guid? SiteId, string? Location);

public sealed record RetireAssetRequest(string? Reason);

/// <summary>A status with its meaning (ok, warn, fault, info, none). Label is "(removed status)" when the type no longer has it.</summary>
public sealed record StatusRef(string Key, string Label, string Meaning);

public sealed record AssetRef(Guid Id, string Tag, string Name);

/// <summary>
/// Assets in use (not retired) against the plan. Limit is null while the plan's limit hasn't reached
/// Assets yet. State: ok, warn (80% or more), blocked (100%). BlockedReason is the sentence a create
/// would answer with, or null.
/// </summary>
public sealed record AssetUsageResponse(int Used, int? Limit, string State, string? BlockedReason);

/// <summary>A row of the register. Values is only filled when the list is filtered by one type (its fields are the page's Columns).</summary>
public sealed record AssetSummary(
    Guid Id, string Tag, string Name, Guid TypeId, string TypeName, StatusRef Status, Guid? SiteId, string Location,
    Guid? ParentId, JsonObject? Values, DateTimeOffset UpdatedAt, DateTimeOffset? RetiredAt);

/// <summary>Columns holds the type's fields when the list is filtered by typeId, so the table can show type-specific columns.</summary>
public sealed record AssetPage(IReadOnlyList<AssetSummary> Items, int Total, int Page, int PageSize, IReadOnlyList<FieldDefinition>? Columns);

/// <summary>
/// One asset. Values holds the type's current fields; OtherValues holds values of fields since removed
/// from the type (read-only). The Cannot…Reason fields explain disabled buttons for the caller.
/// </summary>
public sealed record AssetResponse(
    Guid Id,
    string Tag,
    string Name,
    Guid TypeId,
    string TypeName,
    int TypeVersion,
    IReadOnlyList<FieldDefinition> Fields,
    IReadOnlyList<StatusDefinition> Statuses,
    StatusRef Status,
    Guid? SiteId,
    string Location,
    AssetRef? Parent,
    int ChildCount,
    JsonObject Values,
    JsonObject OtherValues,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? RetiredAt,
    string? RetiredReason,
    string? CannotEditReason,
    string? CannotMoveReason,
    string? CannotRetireReason);
