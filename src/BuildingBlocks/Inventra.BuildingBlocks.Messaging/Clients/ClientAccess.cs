using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Access;
using Inventra.Contracts.Shared;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Inventra.BuildingBlocks.Clients;

/// <summary>
/// Who is acting inside a client for this request, resolved by Access (members, and platform staff
/// under a support pass). Filled in by <see cref="ClientAccess.RequireClientAccess"/> before the endpoint runs.
/// </summary>
public sealed class ClientCaller
{
    private CallerInfo? _info;
    private HashSet<string> _permissions = new(StringComparer.Ordinal);

    public CallerInfo Info => _info ?? throw new InvalidOperationException("RequireClientAccess hasn't run for this endpoint.");
    public Guid TenantId => Info.ClientId;
    public string ActorName => Info.ActorName;
    public bool IsSupport => Info.ActorKind == "support";
    public bool IsOwner => Info.IsOwner;

    public bool Has(string permission) => Info.IsOwner || _permissions.Contains(permission);

    /// <summary>The sites where the caller holds the permission, or null for every site (an all-sites grant wins).</summary>
    public IReadOnlySet<Guid>? SitesFor(string permission)
    {
        if (Info.IsOwner || IsSupport) return null;
        var grants = Info.Grants.Where(g => g.Permissions.Contains(permission)).ToList();
        if (grants.Any(g => g.SiteIds.Count == 0)) return null;
        return grants.SelectMany(g => g.SiteIds).ToHashSet();
    }

    /// <summary>True when the caller holds the permission at this site. Something with no site needs an all-sites grant.</summary>
    public bool HasAt(string permission, Guid? siteId)
    {
        if (!Has(permission)) return false;
        var sites = SitesFor(permission);
        return sites is null || (siteId is { } id && sites.Contains(id));
    }

    /// <summary>An entry for the client's audit log (kept by Access). Publish it through the outbox with the change.</summary>
    public ClientActivityRecorded Activity(string service, string action, string? targetType, Guid? targetId, string details, DateTimeOffset now) =>
        new(TenantId, service, Info.ActorId, Info.ActorName, Info.ActorKind, action, targetType, targetId,
            details.Length > 2000 ? details[..2000] : details, Info.SupportPassId, now);

    internal void Set(CallerInfo info)
    {
        _info = info;
        _permissions = info.Permissions.ToHashSet(StringComparer.Ordinal);
    }
}

/// <summary>The outcome of asking who the caller is: the caller, or the status and plain reason to refuse with.</summary>
public sealed record CallerLookup(CallerInfo? Caller, int Status, string? Detail)
{
    public static CallerLookup Refused(int status, string detail) => new(null, status, detail);
}

/// <summary>Asks Access who the caller is. Replaced by a fake in tests.</summary>
public interface ICallerDirectory
{
    Task<CallerLookup> LookupAsync(HttpContext http, CancellationToken ct);
}

/// <summary>
/// Calls Access's GET /internal/caller with the caller's own token and support pass. Answers are
/// cached for a few seconds per token and pass, so a page of requests costs one lookup; a refusal
/// is never cached. A pass ended by the client stops working within that window.
/// </summary>
internal sealed class AccessCallerDirectory(HttpClient http, IMemoryCache cache, ILogger<AccessCallerDirectory> logger) : ICallerDirectory
{
    public const string SupportPassHeader = "X-Support-Pass";
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(15);

    public async Task<CallerLookup> LookupAsync(HttpContext context, CancellationToken ct)
    {
        var token = context.Request.Headers.Authorization.ToString();
        var pass = context.Request.Headers[SupportPassHeader].ToString();
        var key = "caller:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token + "\n" + pass)));
        if (cache.TryGetValue<CallerInfo>(key, out var cached) && cached is not null) return new CallerLookup(cached, 200, null);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/internal/caller");
        request.Headers.TryAddWithoutValidation("Authorization", token);
        if (pass.Length > 0) request.Headers.TryAddWithoutValidation(SupportPassHeader, pass);

        try
        {
            using var response = await http.SendAsync(request, ct);
            if (response.IsSuccessStatusCode)
            {
                var info = await response.Content.ReadFromJsonAsync<CallerInfo>(ct)
                           ?? throw new InvalidOperationException("Access returned an empty caller.");
                cache.Set(key, info, CacheFor);
                return new CallerLookup(info, 200, null);
            }

            var detail = await DetailOf(response, ct);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                return CallerLookup.Refused((int)response.StatusCode, detail ?? "You can't use this company's data. Sign in again.");

            logger.LogError("Access answered {Status} when resolving the caller: {Detail}", (int)response.StatusCode, detail);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Access couldn't be reached to resolve the caller");
        }

        return CallerLookup.Refused(StatusCodes.Status503ServiceUnavailable,
            "Inventra couldn't check who you are just now, so nothing was changed. Try again in a minute.");
    }

    private static async Task<string?> DetailOf(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            return doc.RootElement.TryGetProperty("detail", out var d) ? d.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>The client-service chassis: who is acting, for which client, with which permissions.</summary>
public static class ClientAccess
{
    /// <summary>
    /// Registers caller resolution through Access (service discovery name "access", or Services:Access:Url).
    /// <paramref name="service"/> names this service in audit entries, e.g. "assets".
    /// </summary>
    public static IHostApplicationBuilder AddClientAccess(this IHostApplicationBuilder builder, string service)
    {
        builder.Services.AddMemoryCache();
        builder.Services.AddScoped<ClientCaller>();
        builder.Services.AddSingleton(new ClientServiceName(service));
        var url = builder.Configuration["Services:Access:Url"] ?? "https+http://access";
        builder.Services.AddHttpClient<ICallerDirectory, AccessCallerDirectory>(c => c.BaseAddress = new Uri(url));
        return builder;
    }

    /// <summary>
    /// Every endpoint in the group needs a caller Access accepts. The gate points row-level security at
    /// the caller's client, refuses writes under a read-only support pass, and records every request
    /// under a support pass in the client's audit log (reads and refused writes included).
    /// </summary>
    public static RouteGroupBuilder RequireClientAccess(this RouteGroupBuilder group)
    {
        group.RequireAuthorization().ProducesProblem(StatusCodes.Status403Forbidden).AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var services = http.RequestServices;
            var lookup = await services.GetRequiredService<ICallerDirectory>().LookupAsync(http, http.RequestAborted);
            if (lookup.Caller is not { } info)
                return TypedResults.Problem(detail: lookup.Detail, statusCode: lookup.Status,
                    title: lookup.Status == StatusCodes.Status503ServiceUnavailable ? "Please try again shortly." : "You can't do that.");

            var caller = services.GetRequiredService<ClientCaller>();
            caller.Set(info);
            await services.GetRequiredService<ITenantContext>().UseAsync(info.ClientId, http.RequestAborted);

            if (caller.IsSupport)
            {
                var refused = info.ReadOnly && !HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method);
                var name = services.GetRequiredService<ClientServiceName>().Name;
                var activity = caller.Activity(name, "support.request", "support_pass", info.SupportPassId,
                    $"{name}: {http.Request.Method} {http.Request.Path}{http.Request.QueryString}{(refused ? " (refused: read-only pass)" : "")}",
                    services.GetRequiredService<TimeProvider>().GetUtcNow());
                await services.GetRequiredService<IMessageBus>().PublishAsync(activity);
                if (refused)
                    return Problems.Forbidden("This support pass is read-only. Ask the Platform Owner for a pass with change access.");
            }

            return await next(context);
        });
        return group;
    }

    /// <summary>Refuses with 403 unless the caller has at least one of these permissions (at some site).</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder endpoint, params string[] anyOf)
        where TBuilder : IEndpointConventionBuilder
    {
        endpoint.AddEndpointFilter(async (context, next) =>
        {
            var caller = context.HttpContext.RequestServices.GetRequiredService<ClientCaller>();
            if (anyOf.Any(caller.Has)) return await next(context);
            return Problems.Forbidden($"You need the {string.Join(" or ", anyOf.Select(p => $"\"{PermissionNames.Of(p)}\""))} permission for this. Ask your company's Owner or an Admin.");
        });
        return endpoint;
    }
}

internal sealed record ClientServiceName(string Name);
