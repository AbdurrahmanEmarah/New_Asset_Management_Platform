using System.Text.RegularExpressions;

namespace Inventra.Access.Domain;

/// <summary>
/// A place where the client works (a building, depot or plant). Roles can be limited to sites.
/// Access keeps the list because site scope is checked here; asset locations inside a site arrive
/// with the Assets service.
/// </summary>
public sealed partial class Site
{
    public const int NameMax = 120;
    public const int CodeMax = 16;

    private Site() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = "";

    /// <summary>A short code shown on tags and lists, e.g. "HQ". Upper case, unique per client.</summary>
    public string Code { get; private set; } = "";
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset CreatedAt { get; private set; }

    public static Site Create(Guid tenantId, string name, string code, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        Name = name.Trim(),
        Code = NormalizeCode(code),
        IsActive = true,
        CreatedAt = now,
    };

    public void Update(string name, string code, bool isActive)
    {
        Name = name.Trim();
        Code = NormalizeCode(code);
        IsActive = isActive;
    }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    /// <summary>The problem with a site code, or null when it's fine.</summary>
    public static string? CodeProblem(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return "Code is required.";
        var c = NormalizeCode(code);
        if (c.Length > CodeMax) return $"Use {CodeMax} characters or fewer.";
        if (!CodePattern().IsMatch(c)) return "Use letters, numbers and dashes, e.g. HQ or DEPOT-2.";
        return null;
    }

    [GeneratedRegex("^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$")]
    private static partial Regex CodePattern();
}
