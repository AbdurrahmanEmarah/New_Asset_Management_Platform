using Inventra.Access.Data;
using Inventra.Access.Domain;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Access.Api;

public static class AuditEndpoints
{
    public static RouteGroupBuilder MapAuditEndpoints(this RouteGroupBuilder app)
    {
        app.MapGet("/audit", ListAudit).WithTags("Audit").Produces<List<AuditEntryResponse>>().RequirePermission(Permissions.AuditView)
            .WithSummary("The company's audit log, newest first. Page with before (an entry id). Filter by supportPassId, or by subjectId (the asset, user, role… an entry is about).");
        return app;
    }

    internal static async Task<IResult> ListAudit(AccessDbContext db, int? take, long? before, Guid? supportPassId, Guid? subjectId, CancellationToken ct)
    {
        var query = db.AuditEntries.AsNoTracking();
        if (before is { } b) query = query.Where(a => a.Id < b);
        if (supportPassId is { } pass) query = query.Where(a => a.SupportPassId == pass);
        if (subjectId is { } subject) query = query.Where(a => a.TargetId == subject);
        var rows = await query.OrderByDescending(a => a.Id).Take(Math.Clamp(take ?? 50, 1, 200)).ToListAsync(ct);
        return TypedResults.Ok(rows.Select(AuditEntryResponse.From).ToList());
    }
}
