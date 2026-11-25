using Inventra.Contracts.Access;

namespace Inventra.Access.Api;

/// <summary>
/// For other client services (Catalog, Assets, Documents): who the caller is, with the caller's own
/// token and support pass. The tenant gate has already refused anyone who may not act, with its reason.
/// </summary>
public static class CallerEndpoints
{
    public const string Path = "/internal/caller";

    public static RouteGroupBuilder MapCallerEndpoints(this RouteGroupBuilder app)
    {
        app.MapGet(Path, (Caller caller) => TypedResults.Ok(ToInfo(caller))).WithTags("Internal")
            .WithSummary("Who the caller is inside their company: permissions, site scope and support pass. Used by other services.");
        return app;
    }

    internal static CallerInfo ToInfo(Caller caller) => new(
        caller.TenantId,
        caller.Client.Name,
        caller.ActorId,
        caller.ActorName,
        caller.Pass is null ? "user" : "support",
        caller.User?.Id,
        caller.IsOwner,
        caller.IsOwner || caller.Pass is not null ? Domain.Permissions.All : caller.Permissions.Order(StringComparer.Ordinal).ToList(),
        caller.Grants.Select(g => new CallerGrant(g.Permissions, g.SiteIds)).ToList(),
        caller.Pass?.Id,
        ReadOnly: caller.Pass is { Access: Domain.SupportAccess.Read });
}
