namespace Inventra.Access.Domain;

public sealed record PermissionInfo(string Key, string Label);

public sealed record PermissionArea(string Key, string Title, IReadOnlyList<PermissionInfo> Permissions);

/// <summary>
/// The permission catalog. Each permission is named area.action. Roles are sets of these.
/// Owner-only powers (subscription, single sign-on, ownership transfer) are not permissions:
/// only the Owner role has them, so they can't be given away by accident.
/// </summary>
public static class Permissions
{
    public const string AssetsRead = "assets.read";
    public const string AssetsWrite = "assets.write";
    public const string AssetsTransfer = "assets.transfer";
    public const string AssetsDispose = "assets.dispose";
    public const string WorkOrdersRead = "workorders.read";
    public const string WorkOrdersCreate = "workorders.create";
    public const string WorkOrdersAssign = "workorders.assign";
    public const string WorkOrdersComplete = "workorders.complete";
    public const string PmManage = "pm.manage";
    public const string ChecklistsManage = "checklists.manage";
    public const string InventoryRead = "inventory.read";
    public const string InventoryWrite = "inventory.write";
    public const string ReportsView = "reports.view";
    public const string AuditView = "audit.view";
    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";
    public const string SettingsManage = "settings.manage";
    public const string IntegrationsManage = "integrations.manage";

    public static IReadOnlyList<PermissionArea> Catalog { get; } =
    [
        new("assets", "Assets", [
            new(AssetsRead, "View assets"),
            new(AssetsWrite, "Create and edit assets"),
            new(AssetsTransfer, "Transfer between sites"),
            new(AssetsDispose, "Retire or dispose"),
        ]),
        new("workorders", "Work orders", [
            new(WorkOrdersRead, "View work orders"),
            new(WorkOrdersCreate, "Raise requests and work orders"),
            new(WorkOrdersAssign, "Assign technicians"),
            new(WorkOrdersComplete, "Complete and sign off"),
        ]),
        new("maintenance", "Maintenance", [
            new(PmManage, "Manage preventive schedules"),
            new(ChecklistsManage, "Edit inspection checklists"),
        ]),
        new("inventory", "Inventory", [
            new(InventoryRead, "View parts and stock"),
            new(InventoryWrite, "Receive and issue parts"),
        ]),
        new("reports", "Reports & audit", [
            new(ReportsView, "View reports"),
            new(AuditView, "View the audit log"),
        ]),
        new("administration", "Administration", [
            new(UsersManage, "Invite and manage users"),
            new(RolesManage, "Edit roles"),
            new(SettingsManage, "Asset types, sites, modules"),
            new(IntegrationsManage, "Integrations and API keys"),
        ]),
    ];

    public static IReadOnlyList<string> All { get; } = Catalog.SelectMany(a => a.Permissions).Select(p => p.Key).ToArray();

    private static readonly Dictionary<string, PermissionInfo> ByKey =
        Catalog.SelectMany(a => a.Permissions).ToDictionary(p => p.Key, StringComparer.Ordinal);

    public static bool Exists(string key) => ByKey.ContainsKey(key);

    public static string LabelOf(string key) => ByKey.TryGetValue(key, out var p) ? p.Label : key;
}
