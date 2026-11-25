using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace Inventra.BuildingBlocks.Auth;

/// <summary>Who is making the current request.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    string Id { get; }
    string Name { get; }
    string? Email { get; }
    bool IsPlatform { get; }

    /// <summary>True for a client user signed in through the tenant realm.</summary>
    bool IsTenant { get; }

    /// <summary>The client a tenant-realm user belongs to (the tenant_id claim). Null for platform staff.</summary>
    Guid? TenantId { get; }

    /// <summary>Whether the identity provider has verified the email address.</summary>
    bool EmailVerified { get; }
    IReadOnlyCollection<string> Roles { get; }
    bool IsInRole(string role);
}

internal sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal Principal => accessor.HttpContext?.User ?? new ClaimsPrincipal();

    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true;

    public string Id => Principal.FindFirstValue(InventraClaims.Subject) ?? "anonymous";

    public string Name =>
        Principal.FindFirstValue(InventraClaims.Name)
        ?? Principal.FindFirstValue("preferred_username")
        ?? Principal.FindFirstValue(InventraClaims.Email)
        ?? Id;

    public string? Email => Principal.FindFirstValue(InventraClaims.Email);

    public bool IsPlatform => Principal.HasClaim(InventraClaims.Realm, InventraClaims.PlatformRealm);

    public bool IsTenant => Principal.HasClaim(InventraClaims.Realm, InventraClaims.TenantRealm);

    public Guid? TenantId =>
        IsTenant && Guid.TryParse(Principal.FindFirstValue(InventraClaims.TenantId), out var id) && id != Guid.Empty ? id : null;

    public bool EmailVerified =>
        string.Equals(Principal.FindFirstValue(InventraClaims.EmailVerified), "true", StringComparison.OrdinalIgnoreCase);

    public IReadOnlyCollection<string> Roles =>
        Principal.FindAll(InventraClaims.Roles).Select(c => c.Value).Distinct().ToArray();

    public bool IsInRole(string role) => Principal.IsInRole(role);
}
