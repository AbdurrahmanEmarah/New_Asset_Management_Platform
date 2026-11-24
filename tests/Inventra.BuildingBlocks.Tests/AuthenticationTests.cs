using System.Security.Claims;
using Inventra.BuildingBlocks.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Inventra.BuildingBlocks.Tests;

public sealed class AuthenticationTests
{
    private static readonly InventraAuthOptions Both = new()
    {
        Platform = new IssuerOptions { Authority = "http://localhost:18080/realms/inventra-platform" },
        Tenant = new IssuerOptions { Authority = "http://localhost:18080/realms/inventra" },
    };

    private static string TokenFrom(string issuer) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Subject = new ClaimsIdentity([new Claim("sub", "u1")]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(new byte[32]), SecurityAlgorithms.HmacSha256),
        });

    private static HttpContext RequestWith(string? token)
    {
        var context = new DefaultHttpContext();
        if (token is not null) context.Request.Headers.Authorization = $"Bearer {token}";
        return context;
    }

    [Fact]
    public void Tokens_from_the_client_realm_go_to_the_tenant_scheme() =>
        Assert.Equal(AuthSchemes.Tenant, AuthenticationExtensions.SelectScheme(RequestWith(TokenFrom("http://localhost:18080/realms/inventra/")), Both));

    [Fact]
    public void Tokens_from_the_platform_realm_go_to_the_platform_scheme() =>
        Assert.Equal(AuthSchemes.Platform, AuthenticationExtensions.SelectScheme(RequestWith(TokenFrom("http://localhost:18080/realms/inventra-platform")), Both));

    [Fact]
    public void Garbage_and_missing_tokens_fall_back_to_platform_which_then_rejects_them()
    {
        Assert.Equal(AuthSchemes.Platform, AuthenticationExtensions.SelectScheme(RequestWith("not-a-jwt"), Both));
        Assert.Equal(AuthSchemes.Platform, AuthenticationExtensions.SelectScheme(RequestWith(null), Both));
    }

    [Fact]
    public void Only_one_issuer_configured_always_uses_it()
    {
        var platformOnly = new InventraAuthOptions { Platform = Both.Platform };
        Assert.Equal(AuthSchemes.Platform, AuthenticationExtensions.SelectScheme(RequestWith(TokenFrom(Both.Tenant.Authority!)), platformOnly));
    }

    [Fact]
    public void A_realm_claim_inside_the_token_is_replaced_by_the_servers_own()
    {
        var identity = new ClaimsIdentity([new Claim(InventraClaims.Realm, InventraClaims.PlatformRealm)], "jwt");
        AuthenticationExtensions.StampRealm(identity, InventraClaims.TenantRealm);
        Assert.Equal([InventraClaims.TenantRealm], identity.FindAll(InventraClaims.Realm).Select(c => c.Value).ToArray());
    }
}
