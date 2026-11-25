namespace Inventra.Contracts.Access;

/// <summary>
/// Who is acting inside a client, as Access sees it: GET /internal/caller with the caller's own token
/// (and X-Support-Pass, if any). Other client services use this instead of reading Access's data.
/// ActorKind is "user" or "support". A grant with no SiteIds applies at every site.
/// </summary>
public sealed record CallerInfo(
    Guid ClientId,
    string ClientName,
    string ActorId,
    string ActorName,
    string ActorKind,
    Guid? UserId,
    bool IsOwner,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<CallerGrant> Grants,
    Guid? SupportPassId,
    bool ReadOnly);

public sealed record CallerGrant(IReadOnlyList<string> Permissions, IReadOnlyList<Guid> SiteIds);

/// <summary>Plain names of the permissions (the catalog itself lives in Access), for messages in other services.</summary>
public static class PermissionNames
{
    public static IReadOnlyDictionary<string, string> Labels { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["assets.read"] = "View assets",
        ["assets.write"] = "Create and edit assets",
        ["assets.transfer"] = "Transfer between sites",
        ["assets.dispose"] = "Retire or dispose",
        ["workorders.read"] = "View work orders",
        ["workorders.create"] = "Raise requests and work orders",
        ["workorders.assign"] = "Assign technicians",
        ["workorders.complete"] = "Complete and sign off",
        ["pm.manage"] = "Manage preventive schedules",
        ["checklists.manage"] = "Edit inspection checklists",
        ["inventory.read"] = "View parts and stock",
        ["inventory.write"] = "Receive and issue parts",
        ["reports.view"] = "View reports",
        ["audit.view"] = "View the audit log",
        ["users.manage"] = "Invite and manage users",
        ["roles.manage"] = "Edit roles",
        ["settings.manage"] = "Asset types, sites, modules",
        ["integrations.manage"] = "Integrations and API keys",
    };

    public static string Of(string key) => Labels.TryGetValue(key, out var label) ? label : key;
}
