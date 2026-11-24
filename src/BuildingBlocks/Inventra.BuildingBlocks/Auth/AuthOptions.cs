namespace Inventra.BuildingBlocks.Auth;

public sealed class InventraAuthOptions
{
    public const string Section = "Auth";

    /// <summary>Sign-in for platform staff (admin console).</summary>
    public IssuerOptions Platform { get; set; } = new();

    /// <summary>Sign-in for client users (web and field apps).</summary>
    public IssuerOptions Tenant { get; set; } = new();
}

public sealed class IssuerOptions
{
    /// <summary>The issuer URL, e.g. http://localhost:18080/realms/inventra-platform.</summary>
    public string? Authority { get; set; }

    public string Audience { get; set; } = "inventra-api";

    /// <summary>Only false for local development over plain HTTP.</summary>
    public bool RequireHttpsMetadata { get; set; } = true;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Authority);
}
