using Inventra.BuildingBlocks.Auth;
using Inventra.Tenancy.Data;
using Inventra.Tenancy.Domain;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Tenancy.Api;

public static class PlatformEndpoints
{
    public static IEndpointRouteBuilder MapPlatformEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/").RequireAuthorization(PlatformPolicies.Read);

        group.MapGet("/me", (ICurrentUser user) => TypedResults.Ok(new MeResponse(
            user.Id, user.Name, user.Email, user.Roles,
            CanManageClients: user.IsInRole(PlatformRoles.Owner),
            CanManageBilling: user.IsInRole(PlatformRoles.Owner) || user.IsInRole(PlatformRoles.Billing))))
            .WithTags("Platform");

        group.MapGet("/plans", async Task<Ok<List<PlanResponse>>> (TenancyDbContext db, CancellationToken ct) =>
            TypedResults.Ok((await db.Plans.AsNoTracking().OrderBy(p => p.SortOrder).ToListAsync(ct)).Select(PlanResponse.From).ToList()))
            .WithTags("Plans");

        group.MapGet("/regions", () => TypedResults.Ok(Regions.All.Select(r => new RegionResponse(r.Key, r.Value)).ToList()))
            .WithTags("Plans");

        group.MapGet("/audit", async Task<Ok<List<AuditEntryResponse>>> (TenancyDbContext db, Guid? clientId, int? take, CancellationToken ct) =>
        {
            var query = db.AuditEntries.AsNoTracking();
            if (clientId is { } id) query = query.Where(a => a.ClientId == id);
            var rows = await query.OrderByDescending(a => a.At).ThenByDescending(a => a.Id)
                .Take(Math.Clamp(take ?? 50, 1, 200))
                .Select(a => new AuditEntryResponse(a.Id, a.At, a.ActorName, a.Action, a.ClientId, a.ClientName, a.Details))
                .ToListAsync(ct);
            return TypedResults.Ok(rows);
        }).WithTags("Audit");

        return app;
    }
}
