using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Inventra.BuildingBlocks.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Inventra.Testing;

/// <summary>A signed-in identity for tests, sent in the X-Test-User header.</summary>
public sealed record TestUser(string Id, string Name, string Realm, params string[] Roles)
{
    public const string Header = "X-Test-User";

    public static TestUser PlatformOwner { get; } = new("owner-1", "Platform Owner", InventraClaims.PlatformRealm, PlatformRoles.Owner);
    public static TestUser PlatformSupport { get; } = new("support-1", "Support Agent", InventraClaims.PlatformRealm, PlatformRoles.Support);
    public static TestUser PlatformBilling { get; } = new("billing-1", "Billing Clerk", InventraClaims.PlatformRealm, PlatformRoles.Billing);

    /// <summary>A client user whose realm admin named a role "platform-owner". Must never pass platform checks.</summary>
    public static TestUser TenantPretendingToBeOwner { get; } = new("tenant-1", "Sneaky Tenant", InventraClaims.TenantRealm, PlatformRoles.Owner);

    /// <summary>The tenant_id claim. Only client users (tenant realm) carry one.</summary>
    public Guid? TenantId { get; init; }

    /// <summary>The email claim. Defaults to {Id}@example.test.</summary>
    public string? Email { get; init; }

    public bool EmailVerified { get; init; } = true;

    /// <summary>A client user signed in through the tenant realm. Leave tenantId null for someone who hasn't joined a client yet.</summary>
    public static TestUser Tenant(Guid? tenantId, string id, string name, string email) =>
        new(id, name, InventraClaims.TenantRealm) { TenantId = tenantId, Email = email };

    public string Encode() => string.Join('|', [Id, Name, Realm, string.Join(',', Roles), TenantId?.ToString() ?? "", Email ?? "", EmailVerified ? "1" : "0"]);

    public static TestUser Decode(string value)
    {
        var parts = value.Split('|');
        return new TestUser(parts[0], parts[1], parts[2], parts[3].Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            TenantId = parts.Length > 4 && Guid.TryParse(parts[4], out var tenant) ? tenant : null,
            Email = parts.Length > 5 && parts[5].Length > 0 ? parts[5] : null,
            EmailVerified = parts.Length <= 6 || parts[6] == "1",
        };
    }
}

public sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(TestUser.Header, out var value) || string.IsNullOrEmpty(value))
            return Task.FromResult(AuthenticateResult.NoResult());

        var user = TestUser.Decode(value!);
        var identity = new ClaimsIdentity(SchemeName, InventraClaims.Name, InventraClaims.Roles);
        identity.AddClaim(new Claim(InventraClaims.Subject, user.Id));
        identity.AddClaim(new Claim(InventraClaims.Name, user.Name));
        identity.AddClaim(new Claim(InventraClaims.Email, user.Email ?? $"{user.Id}@example.test"));
        identity.AddClaim(new Claim(InventraClaims.EmailVerified, user.EmailVerified ? "true" : "false"));
        if (user.TenantId is { } tenantId) identity.AddClaim(new Claim(InventraClaims.TenantId, tenantId.ToString()));
        foreach (var role in user.Roles) identity.AddClaim(new Claim(InventraClaims.Roles, role));
        AuthenticationExtensions.StampRealm(identity, user.Realm);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}

public static class TestAuthExtensions
{
    /// <summary>Replaces JWT validation with the X-Test-User header.</summary>
    public static IServiceCollection AddTestAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(o =>
            {
                o.DefaultScheme = TestAuthHandler.SchemeName;
                o.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                o.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                o.DefaultForbidScheme = TestAuthHandler.SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
        return services;
    }

    public static HttpClient As(this HttpClient client, TestUser? user)
    {
        client.DefaultRequestHeaders.Remove(TestUser.Header);
        if (user is not null) client.DefaultRequestHeaders.Add(TestUser.Header, user.Encode());
        return client;
    }
}
