namespace Inventra.Tenancy.Domain;

/// <summary>Where a client's data is stored. Chosen once, when the client is created.</summary>
public static class Regions
{
    public static IReadOnlyDictionary<string, string> All { get; } = new Dictionary<string, string>
    {
        ["uae-north"] = "UAE North",
        ["west-europe"] = "West Europe",
    };

    public static string NameOf(string key) => All.TryGetValue(key, out var name) ? name : key;
}
