using static Inventra.Access.Domain.Permissions;

namespace Inventra.Access.Domain;

public sealed record BuiltInRole(string Key, string Name, string Description, IReadOnlyList<string> Permissions);

/// <summary>The roles every client starts with. All but Owner can be edited; any of them can be copied.</summary>
public static class BuiltInRoles
{
    public const string Owner = "owner";
    public const string Admin = "admin";
    public const string AssetManager = "asset_manager";
    public const string MaintenancePlanner = "maintenance_planner";
    public const string Technician = "technician";
    public const string Storekeeper = "storekeeper";
    public const string Requester = "requester";
    public const string Viewer = "viewer";

    public static IReadOnlyList<BuiltInRole> All { get; } =
    [
        new(Owner, "Owner", "Full control of the company account, including subscription, single sign-on and ownership transfer.", Permissions.All),
        new(Admin, "Admin", "Runs the workspace: users, roles, sites, asset types, modules and integrations.", Permissions.All),
        new(AssetManager, "Asset Manager", "Owns the asset register: adds, edits, moves and retires assets.",
            [AssetsRead, AssetsWrite, AssetsTransfer, AssetsDispose, WorkOrdersRead, InventoryRead, ReportsView]),
        new(MaintenancePlanner, "Maintenance Planner", "Plans the work: raises and assigns work orders and keeps preventive schedules up to date.",
            [AssetsRead, WorkOrdersRead, WorkOrdersCreate, WorkOrdersAssign, WorkOrdersComplete, PmManage, ChecklistsManage, InventoryRead, ReportsView]),
        new(Technician, "Technician", "Does the work, mostly in the field app: sees their own jobs, records readings and completes them.",
            [AssetsRead, WorkOrdersRead, WorkOrdersComplete, InventoryRead]),
        new(Storekeeper, "Storekeeper", "Looks after parts: receives deliveries, issues parts to jobs and keeps stock counts right.",
            [AssetsRead, WorkOrdersRead, InventoryRead, InventoryWrite]),
        new(Requester, "Requester", "Anyone who reports a fault. They can see assets and raise a request, nothing more.",
            [AssetsRead, WorkOrdersCreate]),
        new(Viewer, "Viewer / Auditor", "Read-only access to the register, work history, reports and the audit log.",
            [AssetsRead, WorkOrdersRead, InventoryRead, ReportsView, AuditView]),
    ];
}
