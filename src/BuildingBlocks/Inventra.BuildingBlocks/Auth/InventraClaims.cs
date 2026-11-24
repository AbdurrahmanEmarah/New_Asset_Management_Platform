namespace Inventra.BuildingBlocks.Auth;

/// <summary>Claim names used across Inventra. Tokens are read with inbound claim mapping off.</summary>
public static class InventraClaims
{
    public const string Subject = "sub";
    public const string Name = "name";
    public const string Email = "email";
    public const string Roles = "roles";
    public const string TenantId = "tenant_id";

    /// <summary>
    /// Added by the server after a token is validated: "platform" or "tenant".
    /// Never trusted from the token itself (any incoming value is removed first),
    /// so a client realm can't mint a platform identity by naming a role "platform-owner".
    /// </summary>
    public const string Realm = "inventra:realm";

    public const string PlatformRealm = "platform";
    public const string TenantRealm = "tenant";
}

public static class AuthSchemes
{
    /// <summary>The default scheme. It forwards to Platform or Tenant by the token's issuer.</summary>
    public const string Bearer = "Bearer";
    public const string Platform = "Platform";
    public const string Tenant = "Tenant";
}

/// <summary>Realm roles of the platform realm (you and your staff).</summary>
public static class PlatformRoles
{
    public const string Owner = "platform-owner";
    public const string Support = "platform-support";
    public const string Billing = "platform-billing";

    public static readonly string[] All = [Owner, Support, Billing];
}

public static class PlatformPolicies
{
    /// <summary>Any platform staff member: owner, support or billing.</summary>
    public const string Read = "platform:read";

    /// <summary>Create, suspend and reactivate clients: owner only.</summary>
    public const string ManageClients = "platform:clients:manage";

    /// <summary>Change a client's plan: owner or billing.</summary>
    public const string ManageBilling = "platform:billing:manage";
}
