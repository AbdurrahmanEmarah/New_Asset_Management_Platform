namespace Inventra.Tenancy.Domain;

/// <summary>A subscription plan and the limits the platform enforces for it.</summary>
public sealed class Plan
{
    public required string Key { get; init; }
    public required string Name { get; set; }
    public int MaxUsers { get; set; }
    public int MaxAssets { get; set; }
    public int StorageGb { get; set; }
    public List<string> Modules { get; set; } = [];
    public bool IsTrial { get; set; }
    public int SortOrder { get; set; }
}

public static class Modules
{
    public const string Assets = "assets";
    public const string Maintenance = "maintenance";
    public const string Inventory = "inventory";
    public const string Integrations = "integrations";
    public const string Reporting = "reporting";
}

public static class PlanCatalog
{
    public const string Trial = "trial";
    public const string Starter = "starter";
    public const string Business = "business";
    public const string Enterprise = "enterprise";

    public const int TrialDays = 14;

    public static IReadOnlyList<Plan> Defaults { get; } =
    [
        new() { Key = Trial, Name = "Trial", MaxUsers = 10, MaxAssets = 500, StorageGb = 5, IsTrial = true, SortOrder = 0,
                Modules = [Modules.Assets, Modules.Maintenance] },
        new() { Key = Starter, Name = "Starter", MaxUsers = 25, MaxAssets = 2_000, StorageGb = 20, SortOrder = 1,
                Modules = [Modules.Assets, Modules.Maintenance] },
        new() { Key = Business, Name = "Business", MaxUsers = 200, MaxAssets = 10_000, StorageGb = 100, SortOrder = 2,
                Modules = [Modules.Assets, Modules.Maintenance, Modules.Inventory, Modules.Integrations] },
        new() { Key = Enterprise, Name = "Enterprise", MaxUsers = 1_000, MaxAssets = 50_000, StorageGb = 500, SortOrder = 3,
                Modules = [Modules.Assets, Modules.Maintenance, Modules.Inventory, Modules.Integrations, Modules.Reporting] },
    ];
}
