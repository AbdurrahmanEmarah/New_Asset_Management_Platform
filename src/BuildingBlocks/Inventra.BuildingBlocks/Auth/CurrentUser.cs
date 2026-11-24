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

    public IReadOnlyCollection<string> Roles =>
        Principal.FindAll(InventraClaims.Roles).Select(c => c.Value).Distinct().ToArray();

    public bool IsInRole(string role) => Principal.IsInRole(role);
}
