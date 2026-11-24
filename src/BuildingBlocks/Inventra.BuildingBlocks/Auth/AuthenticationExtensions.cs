using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Inventra.BuildingBlocks.Auth;

public static class AuthenticationExtensions
{
    /// <summary>
    /// Adds JWT validation for the platform and tenant issuers plus Inventra's platform policies.
    /// The default scheme picks the right issuer by peeking at the token's "iss" claim.
    /// </summary>
    public static IHostApplicationBuilder AddInventraAuthentication(this IHostApplicationBuilder builder)
    {
        var options = builder.Configuration.GetSection(InventraAuthOptions.Section).Get<InventraAuthOptions>()
                      ?? new InventraAuthOptions();

        if (!options.Platform.IsConfigured && !options.Tenant.IsConfigured
            && !builder.Environment.IsEnvironment("Testing"))
        {
            throw new InvalidOperationException(
                "No sign-in issuer is configured. Set Auth:Platform:Authority and/or Auth:Tenant:Authority.");
        }

        var auth = builder.Services
            .AddAuthentication(AuthSchemes.Bearer)
            .AddPolicyScheme(AuthSchemes.Bearer, "Platform or tenant token", o =>
                o.ForwardDefaultSelector = ctx => SelectScheme(ctx, options));

        if (options.Platform.IsConfigured)
        {
            auth.AddJwtBearer(AuthSchemes.Platform, o => Configure(o, options.Platform, InventraClaims.PlatformRealm));
        }

        if (options.Tenant.IsConfigured)
        {
            auth.AddJwtBearer(AuthSchemes.Tenant, o => Configure(o, options.Tenant, InventraClaims.TenantRealm));
        }

        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(PlatformPolicies.Read, p => p.RequireAuthenticatedUser()
                .RequireClaim(InventraClaims.Realm, InventraClaims.PlatformRealm)
                .RequireRole(PlatformRoles.All))
            .AddPolicy(PlatformPolicies.ManageClients, p => p.RequireAuthenticatedUser()
                .RequireClaim(InventraClaims.Realm, InventraClaims.PlatformRealm)
                .RequireRole(PlatformRoles.Owner))
            .AddPolicy(PlatformPolicies.ManageBilling, p => p.RequireAuthenticatedUser()
                .RequireClaim(InventraClaims.Realm, InventraClaims.PlatformRealm)
                .RequireRole(PlatformRoles.Owner, PlatformRoles.Billing))
            .AddPolicy(PlatformPolicies.RequestSupportAccess, p => p.RequireAuthenticatedUser()
                .RequireClaim(InventraClaims.Realm, InventraClaims.PlatformRealm)
                .RequireRole(PlatformRoles.Owner, PlatformRoles.Support));

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
        return builder;
    }

    internal static string SelectScheme(HttpContext context, InventraAuthOptions options)
    {
        if (!options.Tenant.IsConfigured) return AuthSchemes.Platform;
        if (!options.Platform.IsConfigured) return AuthSchemes.Tenant;

        var header = context.Request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        if (header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            var issuer = TryReadIssuer(header[prefix.Length..].Trim());
            if (issuer is not null && SameIssuer(issuer, options.Tenant.Authority!)) return AuthSchemes.Tenant;
        }

        return AuthSchemes.Platform;
    }

    internal static string? TryReadIssuer(string token)
    {
        try
        {
            return new JsonWebTokenHandler().ReadJsonWebToken(token).Issuer;
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static bool SameIssuer(string a, string b) =>
        string.Equals(a.TrimEnd('/'), b.TrimEnd('/'), StringComparison.OrdinalIgnoreCase);

    private static void Configure(JwtBearerOptions o, IssuerOptions issuer, string realm)
    {
        o.Authority = issuer.Authority;
        o.Audience = issuer.Audience;
        o.RequireHttpsMetadata = issuer.RequireHttpsMetadata;
        o.MapInboundClaims = false;
        o.TokenValidationParameters.NameClaimType = InventraClaims.Name;
        o.TokenValidationParameters.RoleClaimType = InventraClaims.Roles;
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = ctx =>
            {
                if (ctx.Principal?.Identity is ClaimsIdentity identity) StampRealm(identity, realm);
                return Task.CompletedTask;
            },
        };
    }

    /// <summary>Removes any realm claim the token carried and adds the server's own.</summary>
    public static void StampRealm(ClaimsIdentity identity, string realm)
    {
        foreach (var claim in identity.FindAll(InventraClaims.Realm).ToList()) identity.RemoveClaim(claim);
        identity.AddClaim(new Claim(InventraClaims.Realm, realm));
    }
}
