using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Access;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Api;

public static class SiteEndpoints
{
    public static RouteGroupBuilder MapSiteEndpoints(this RouteGroupBuilder app)
    {
        var sites = app.MapGroup("/sites").WithTags("Sites");
        sites.MapGet("/", ListSites).Produces<List<SiteResponse>>().WithSummary("The company's sites. Every member can read them; roles can be limited to them.");
        sites.MapPost("/", CreateSite).Produces<SiteResponse>(201).ProducesValidationProblem().RequirePermission(Permissions.SettingsManage);
        sites.MapPut("/{id:guid}", UpdateSite).Produces<SiteResponse>().ProducesValidationProblem().ProducesProblem(404).RequirePermission(Permissions.SettingsManage);
        return app;
    }

    internal static async Task<IResult> ListSites(AccessDbContext db, CancellationToken ct) =>
        TypedResults.Ok((await db.Sites.AsNoTracking().OrderBy(s => s.Name).ToListAsync(ct)).Select(SiteResponse.From).ToList());

    internal static async Task<IResult> CreateSite(SiteRequest request, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        if (await ValidateAsync(request, db, null, ct) is { } invalid) return invalid;
        var now = clock.GetUtcNow();
        var site = Site.Create(caller.TenantId, request.Name!, request.Code!, now);
        db.Sites.Add(site);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.SiteCreated, "site", site.Id, $"Added site {site.Name} ({site.Code}).", now));
        await outbox.PublishAsync(new SiteCreated(site.TenantId, site.Id, site.Name, site.Code, site.IsActive, now));
        if (await SaveAsync(outbox, site.Code, ct) is { } taken) return taken;
        return TypedResults.Created($"/sites/{site.Id}", SiteResponse.From(site));
    }

    internal static async Task<IResult> UpdateSite(Guid id, SiteRequest request, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var site = await db.Sites.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (site is null) return Problems.NotFound("No site has this id.");
        if (await ValidateAsync(request, db, id, ct) is { } invalid) return invalid;

        var before = $"{site.Name} ({site.Code}){(site.IsActive ? "" : ", inactive")}";
        site.Update(request.Name!, request.Code!, request.IsActive ?? site.IsActive);
        var after = $"{site.Name} ({site.Code}){(site.IsActive ? "" : ", inactive")}";
        var now = clock.GetUtcNow();
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.SiteUpdated, "site", site.Id, $"{before} → {after}.", now));
        await outbox.PublishAsync(new SiteUpdated(site.TenantId, site.Id, site.Name, site.Code, site.IsActive, now));
        if (await SaveAsync(outbox, site.Code, ct) is { } taken) return taken;
        return TypedResults.Ok(SiteResponse.From(site));
    }

    private static async Task<IResult?> ValidateAsync(SiteRequest request, AccessDbContext db, Guid? excluding, CancellationToken ct)
    {
        var errors = new FieldErrors().Require("name", request.Name, "Site name");
        if (request.Name?.Trim().Length > Site.NameMax) errors.Add("name", $"Use {Site.NameMax} characters or fewer.");
        if (Site.CodeProblem(request.Code) is { } codeProblem) errors.Add("code", codeProblem);
        else
        {
            var code = Site.NormalizeCode(request.Code!);
            if (await db.Sites.AnyAsync(s => s.Code == code && s.Id != excluding, ct)) errors.Add("code", CodeTaken(code));
        }

        return errors.Any ? errors.ToResult() : null;
    }

    /// <summary>Saves the site, its audit entry and the event for Assets in one transaction.</summary>
    private static async Task<IResult?> SaveAsync(IDbContextOutbox<AccessDbContext> outbox, string code, CancellationToken ct)
    {
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
            return null;
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(AccessDbContext.SiteCodeIndex))
        {
            return new FieldErrors().Add("code", CodeTaken(code)).ToResult();
        }
    }

    private static string CodeTaken(string code) => $"Another site already uses the code {code}. Choose another code.";
}
