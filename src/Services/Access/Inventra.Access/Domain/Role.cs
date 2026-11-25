namespace Inventra.Access.Domain;

/// <summary>A named set of permissions. Where it applies is set per person, on the assignment (<see cref="UserRole"/>).</summary>
public sealed class Role
{
    public const int NameMax = 60;
    public const int DescriptionMax = 300;

    private Role() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Set for the built-in roles (see <see cref="BuiltInRoles"/>), null for roles the client made.</summary>
    public string? BuiltInKey { get; private set; }
    public string Name { get; private set; } = "";

    /// <summary>Lower-case name, unique per client.</summary>
    public string NormalizedName { get; private set; } = "";
    public string Description { get; private set; } = "";
    public List<string> Permissions { get; private set; } = [];
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public bool IsBuiltIn => BuiltInKey is not null;
    public bool IsOwner => BuiltInKey == BuiltInRoles.Owner;

    /// <summary>"owner", "built_in" or "custom". Apps match on this, never on names.</summary>
    public string Kind => IsOwner ? "owner" : IsBuiltIn ? "built_in" : "custom";

    /// <summary>The Owner role always has every permission, including ones added to the catalog later.</summary>
    public IReadOnlyList<string> EffectivePermissions => IsOwner ? Domain.Permissions.All : Permissions;

    public static Role FromBuiltIn(Guid tenantId, BuiltInRole template, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        BuiltInKey = template.Key,
        Name = template.Name,
        NormalizedName = Normalize(template.Name),
        Description = template.Description,
        Permissions = template.Key == BuiltInRoles.Owner ? [] : [.. template.Permissions],
        CreatedAt = now,
        UpdatedAt = now,
    };

    public static Role Custom(Guid tenantId, string name, string description, IEnumerable<string> permissions, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(now),
        TenantId = tenantId,
        Name = name.Trim(),
        NormalizedName = Normalize(name),
        Description = description.Trim(),
        Permissions = Sorted(permissions),
        CreatedAt = now,
        UpdatedAt = now,
    };

    public static string Normalize(string name) => name.Trim().ToLowerInvariant();

    /// <summary>Why this role can't be edited, or null when it can.</summary>
    public string? CannotEditReason() => IsOwner
        ? "The Owner role always has every permission and can't be edited. A company must keep at least one Owner."
        : null;

    /// <summary>Why this role can't be deleted, or null when it can.</summary>
    public string? CannotDeleteReason(int members)
    {
        if (IsBuiltIn) return $"{Name} is a built-in role, so it can't be deleted. Change its permissions, or stop giving it to people.";
        if (members > 0) return $"{members} {(members == 1 ? "person has" : "people have")} this role. Give them another role first.";
        return null;
    }

    public void Update(string name, string description, IEnumerable<string> permissions, DateTimeOffset now)
    {
        if (CannotEditReason() is { } why) throw new InvalidOperationException(why);
        Name = name.Trim();
        NormalizedName = Normalize(name);
        Description = description.Trim();
        Permissions = Sorted(permissions);
        UpdatedAt = now;
    }

    private static List<string> Sorted(IEnumerable<string> permissions) => permissions.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
}
