using Inventra.Access.Domain;

namespace Inventra.Access.Api;

// Requests take strings for choices (theme, access) so a wrong value gets a plain-language field
// error instead of a generic binding failure. Responses use enums, serialised in snake_case.

public sealed record PreferencesRequest(string? Theme);

public sealed record InviteUserRequest(string? Email, string? Name, IReadOnlyList<Guid>? RoleIds);

public sealed record SetUserRolesRequest(IReadOnlyList<Guid>? RoleIds);

public sealed record RoleRequest(string? Name, string? Description, IReadOnlyList<string>? Permissions, IReadOnlyList<Guid>? SiteIds);

public sealed record CopyRoleRequest(string? Name);

public sealed record SiteRequest(string? Name, string? Code, bool? IsActive);

public sealed record InvitationTokenRequest(string? Token);

public sealed record StartSupportPassRequest(string? Reason, int? Minutes, string? Access);

public sealed record CompanyRef(Guid Id, string Name, string Slug);

public sealed record RoleRef(Guid Id, string Name);

/// <summary>A role's permissions and where they apply. AllSites is true when SiteIds is empty.</summary>
public sealed record GrantResponse(Guid RoleId, string RoleName, IReadOnlyList<string> Permissions, bool AllSites, IReadOnlyList<Guid> SiteIds)
{
    public static GrantResponse From(RoleGrant g) => new(g.RoleId, g.RoleName, g.Permissions, g.SiteIds.Count == 0, g.SiteIds);
}

public sealed record SupportSessionResponse(Guid PassId, SupportAccess Access, DateTimeOffset ExpiresAt);

/// <summary>
/// The signed-in person in their company. Apps call this right after sign-in: a 403 here explains
/// why the person can't use the app (not invited, deactivated, or the company is suspended).
/// </summary>
public sealed record MeResponse(
    Guid? UserId,
    string Name,
    string? Email,
    ThemePreference Theme,
    CompanyRef Company,
    bool IsOwner,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<GrantResponse> Grants,
    SupportSessionResponse? SupportSession);

public sealed record PermissionResponse(string Key, string Label);

public sealed record PermissionAreaResponse(string Key, string Title, IReadOnlyList<PermissionResponse> Permissions);

/// <summary>Kind is "owner", "built_in" or "custom". The Cannot…Reason fields say why a button is disabled.</summary>
public sealed record RoleResponse(
    Guid Id,
    string Name,
    string Description,
    string Kind,
    string? BuiltInKey,
    IReadOnlyList<string> Permissions,
    bool AllSites,
    IReadOnlyList<Guid> SiteIds,
    int MemberCount,
    string? CannotEditReason,
    string? CannotDeleteReason,
    DateTimeOffset UpdatedAt)
{
    public static RoleResponse From(Role r, int members) => new(
        r.Id, r.Name, r.Description, r.IsOwner ? "owner" : r.IsBuiltIn ? "built_in" : "custom", r.BuiltInKey,
        r.EffectivePermissions, r.SiteIds.Count == 0, r.SiteIds, members,
        r.CannotEditReason(), r.CannotDeleteReason(members), r.UpdatedAt);
}

/// <summary>A person. The Cannot…Reason fields are for the person asking, so the UI can explain disabled buttons.</summary>
public sealed record UserResponse(
    Guid Id,
    string Email,
    string Name,
    UserStatus Status,
    bool IsOwner,
    IReadOnlyList<RoleRef> Roles,
    DateTimeOffset InvitedAt,
    string InvitedByName,
    DateTimeOffset? InvitationExpiresAt,
    DateTimeOffset? JoinedAt,
    DateTimeOffset? DeactivatedAt,
    string? DeactivatedByName,
    string? CannotDeactivateReason,
    string? CannotChangeRolesReason);

/// <summary>AcceptUrl is shown once. Until email sending arrives (Notifications), the inviter passes it on.</summary>
public sealed record InvitationLinkResponse(UserResponse User, string AcceptUrl, DateTimeOffset ExpiresAt);

/// <summary>Seats in use (active + invited) against the plan's limit. State: ok, warn (80%+), blocked (100%).</summary>
public sealed record SeatSummary(int Seats, int Active, int Invited, int Deactivated, int Limit, string State);

public sealed record SiteResponse(Guid Id, string Name, string Code, bool IsActive)
{
    public static SiteResponse From(Site s) => new(s.Id, s.Name, s.Code, s.IsActive);
}

public sealed record AuditEntryResponse(
    long Id, DateTimeOffset At, string ActorName, ActorKind ActorKind, string Action, string? TargetType, Guid? TargetId, string Details, Guid? SupportPassId)
{
    public static AuditEntryResponse From(AuditEntry a) =>
        new(a.Id, a.At, a.ActorName, a.ActorKind, a.Action, a.TargetType, a.TargetId, a.Details, a.SupportPassId);
}

public sealed record SupportPassResponse(
    Guid Id,
    Guid ClientId,
    string RequestedByName,
    string Reason,
    SupportAccess Access,
    SupportPassStatus Status,
    DateTimeOffset StartedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? EndedAt,
    string? EndedByName,
    int ActionCount)
{
    public static SupportPassResponse From(SupportPass p, DateTimeOffset now, int actions) => new(
        p.Id, p.TenantId, p.RequestedByName, p.Reason, p.Access, p.StatusAt(now), p.StartedAt, p.ExpiresAt, p.EndedAt, p.EndedByName, actions);
}

/// <summary>Send HeaderName: HeaderValue on Access requests to act under the pass.</summary>
public sealed record StartedSupportPassResponse(SupportPassResponse Pass, string HeaderName, string HeaderValue);

public sealed record InvitationPreviewResponse(
    Guid ClientId,
    string CompanyName,
    string Email,
    string Name,
    string InvitedByName,
    IReadOnlyList<string> Roles,
    DateTimeOffset ExpiresAt,
    string? CannotAcceptReason);

/// <summary>After joining, the app must refresh the sign-in so the token carries the company (tenant_id).</summary>
public sealed record AcceptInvitationResponse(Guid ClientId, string CompanyName, Guid UserId, bool SignInAgain);

public sealed record OwnerInvitationResponse(Guid ClientId, string Email, string Name, UserStatus Status, DateTimeOffset? ExpiresAt, string? AcceptUrl);
