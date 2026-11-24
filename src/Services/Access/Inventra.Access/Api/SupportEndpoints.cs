using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Access;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Api;

/// <summary>The client's view of support passes: who from Inventra had access, why, and what they did.</summary>
public static class SupportEndpoints
{
    public static RouteGroupBuilder MapSupportEndpoints(this RouteGroupBuilder app)
    {
        var passes = app.MapGroup("/support-passes").WithTags("Support access");
        passes.MapGet("/", ListPasses).Produces<List<SupportPassResponse>>().RequirePermission(Permissions.AuditView, Permissions.UsersManage)
            .WithSummary("Support passes into this company, newest first, with how many actions each recorded.");
        passes.MapPost("/{id:guid}/end", EndPass).Produces<SupportPassResponse>().ProducesProblem(404).ProducesProblem(409).RequirePermission(Permissions.UsersManage)
            .WithSummary("Ends a support pass early.");
        return app;
    }

    internal static async Task<List<SupportPassResponse>> LoadAsync(AccessDbContext db, DateTimeOffset now, CancellationToken ct)
    {
        var passes = await db.SupportPasses.AsNoTracking().OrderByDescending(p => p.StartedAt).Take(100).ToListAsync(ct);
        var ids = passes.Select(p => p.Id).ToList();
        var counts = await db.AuditEntries.Where(a => a.SupportPassId != null && ids.Contains(a.SupportPassId.Value) && a.Action == AccessAuditActions.SupportRequest)
            .GroupBy(a => a.SupportPassId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return passes.Select(p => SupportPassResponse.From(p, now, counts.GetValueOrDefault(p.Id))).ToList();
    }

    internal static async Task<IResult> ListPasses(AccessDbContext db, TimeProvider clock, CancellationToken ct) =>
        TypedResults.Ok(await LoadAsync(db, clock.GetUtcNow(), ct));

    internal static async Task<IResult> EndPass(Guid id, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (caller.User is null) return Problems.Conflict("End your own pass from the admin console.");
        var pass = await db.SupportPasses.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (pass is null) return Problems.NotFound("No support pass has this id.");

        var now = clock.GetUtcNow();
        if (pass.CannotEndReason(now) is { } why) return Problems.Conflict(why);
        pass.End(caller.ActorName, now);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.SupportPassEnded, "support_pass", pass.Id, $"Ended {pass.RequestedByName}'s support pass.", now));
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(SupportPassResponse.From(pass, now, 0));
    }
}

/// <summary>Platform staff (admin console): support passes and the Owner invitation, one client at a time.</summary>
public static class PlatformEndpoints
{
    public static IEndpointRouteBuilder MapPlatformEndpoints(this IEndpointRouteBuilder app)
    {
        var client = app.MapGroup("/platform/clients/{clientId:guid}").WithTags("Platform").RequireAuthorization(PlatformPolicies.Read);
        client.MapGet("/support-passes", ListPasses).Produces<List<SupportPassResponse>>().ProducesProblem(404);
        client.MapPost("/support-passes", StartPass).Produces<StartedSupportPassResponse>(201).ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409).RequireAuthorization(PlatformPolicies.RequestSupportAccess)
            .WithSummary("Opens a time-limited support pass. Read-only unless access is \"change\" (Platform Owner only).");
        client.MapPost("/support-passes/{id:guid}/end", EndPass).Produces<SupportPassResponse>().ProducesProblem(404).ProducesProblem(409).RequireAuthorization(PlatformPolicies.RequestSupportAccess);
        client.MapGet("/owner-invitation", GetOwnerInvitation).Produces<OwnerInvitationResponse>().ProducesProblem(404);
        client.MapPost("/owner-invitation", ReissueOwnerInvitation).Produces<OwnerInvitationResponse>().ProducesProblem(404).ProducesProblem(409).RequireAuthorization(PlatformPolicies.ManageClients)
            .WithSummary("Makes a new invitation link for the client's first Owner (until email sending arrives).");
        return app;
    }

    private static async Task<(ClientAccount? Client, IResult? Problem)> EnterAsync(Guid clientId, AccessDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(clientId, ct);
        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(ct);
        return client is null
            ? (null, Problems.NotFound("Access hasn't set up this client yet. If it was just created, wait a few seconds and try again."))
            : (client, null);
    }

    internal static async Task<IResult> ListPasses(Guid clientId, AccessDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct)
    {
        var (client, problem) = await EnterAsync(clientId, db, tenant, ct);
        if (client is null) return problem!;
        return TypedResults.Ok(await SupportEndpoints.LoadAsync(db, clock.GetUtcNow(), ct));
    }

    internal static async Task<IResult> StartPass(
        Guid clientId, StartSupportPassRequest request, AccessDbContext db, ITenantContext tenant, ICurrentUser user,
        IDbContextOutbox<AccessDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var errors = new FieldErrors();
        var reason = request.Reason?.Trim() ?? "";
        if (reason.Length < SupportPass.ReasonMin)
            errors.Add("reason", $"Say why you need access, in at least {SupportPass.ReasonMin} characters. The client's admins will see this.");
        if (reason.Length > SupportPass.ReasonMax) errors.Add("reason", $"Use {SupportPass.ReasonMax} characters or fewer.");
        var minutes = request.Minutes ?? SupportPass.DefaultMinutes;
        if (minutes is < SupportPass.MinMinutes or > SupportPass.MaxMinutes)
            errors.Add("minutes", $"Choose between {SupportPass.MinMinutes} minutes and {SupportPass.MaxMinutes / 60} hours.");
        SupportAccess? access = (request.Access?.Trim().ToLowerInvariant() ?? "read") switch
        {
            "read" => SupportAccess.Read,
            "change" => SupportAccess.Change,
            _ => null,
        };
        if (access is null) errors.Add("access", "Choose read (look only) or change.");
        if (errors.Any) return errors.ToResult();
        if (access == SupportAccess.Change && !user.IsInRole(PlatformRoles.Owner))
            return Problems.Forbidden("Only the Platform Owner can open a pass with change access. Request a read-only pass instead.");

        var (client, problem) = await EnterAsync(clientId, db, tenant, ct);
        if (client is null) return problem!;

        var now = clock.GetUtcNow();
        var open = await db.SupportPasses.AsNoTracking()
            .Where(p => p.RequestedById == user.Id && p.EndedAt == null && p.ExpiresAt > now).FirstOrDefaultAsync(ct);
        if (open is not null)
            return Problems.Conflict($"You already have a support pass for {client.Name} until {open.ExpiresAt:HH:mm} UTC. Use it, or end it before opening another.");

        var pass = SupportPass.Start(client.TenantId, user.Id, user.Name, reason, access!.Value, minutes, now);
        db.SupportPasses.Add(pass);
        var details = $"{(pass.Access == SupportAccess.Read ? "Read-only" : "Change")} access for {minutes} minutes. Reason: {pass.Reason}";
        db.AuditEntries.Add(AuditEntry.Create(client.TenantId, user.Id, $"{user.Name} (Inventra support)", ActorKind.Platform,
            AccessAuditActions.SupportPassStarted, "support_pass", pass.Id, details, pass.Id, now));
        await outbox.PublishAsync(new PlatformActivityRecorded(user.Id, user.Name, AccessAuditActions.SupportPassStarted, client.TenantId, details, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);

        return TypedResults.Created($"/platform/clients/{clientId}/support-passes/{pass.Id}",
            new StartedSupportPassResponse(SupportPassResponse.From(pass, now, 0), SupportPass.Header, pass.HeaderValue));
    }

    internal static async Task<IResult> EndPass(
        Guid clientId, Guid id, AccessDbContext db, ITenantContext tenant, ICurrentUser user,
        IDbContextOutbox<AccessDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var (client, problem) = await EnterAsync(clientId, db, tenant, ct);
        if (client is null) return problem!;

        var pass = await db.SupportPasses.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (pass is null) return Problems.NotFound("No support pass has this id for this client.");
        if (pass.RequestedById != user.Id && !user.IsInRole(PlatformRoles.Owner))
            return Problems.Forbidden("Only the person who opened this pass, or the Platform Owner, can end it.");

        var now = clock.GetUtcNow();
        if (pass.CannotEndReason(now) is { } why) return Problems.Conflict(why);
        pass.End(user.Name, now);
        var details = $"Ended {pass.RequestedByName}'s support pass.";
        db.AuditEntries.Add(AuditEntry.Create(client.TenantId, user.Id, $"{user.Name} (Inventra support)", ActorKind.Platform,
            AccessAuditActions.SupportPassEnded, "support_pass", pass.Id, details, pass.Id, now));
        await outbox.PublishAsync(new PlatformActivityRecorded(user.Id, user.Name, AccessAuditActions.SupportPassEnded, client.TenantId, details, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.Ok(SupportPassResponse.From(pass, now, 0));
    }

    private static async Task<AppUser?> FirstOwnerAsync(AccessDbContext db, CancellationToken ct)
    {
        var owners = await OwnerFacts.LoadAsync(db, ct);
        return await db.Users.Where(u => u.Roles.Any(r => r.RoleId == owners.OwnerRoleId) && u.Status != UserStatus.Deactivated)
            .OrderBy(u => u.InvitedAt).FirstOrDefaultAsync(ct);
    }

    internal static async Task<IResult> GetOwnerInvitation(Guid clientId, AccessDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct)
    {
        var (client, problem) = await EnterAsync(clientId, db, tenant, ct);
        if (client is null) return problem!;
        var owner = await FirstOwnerAsync(db, ct);
        if (owner is null) return Problems.NotFound($"{client.Name} has no Owner.");

        var now = clock.GetUtcNow();
        var invitation = await db.Invitations.AsNoTracking().Where(i => i.UserId == owner.Id && i.Status == InvitationStatus.Pending && i.ExpiresAt > now)
            .OrderByDescending(i => i.CreatedAt).FirstOrDefaultAsync(ct);
        return TypedResults.Ok(new OwnerInvitationResponse(client.TenantId, owner.Email, owner.Name, owner.Status, invitation?.ExpiresAt, AcceptUrl: null));
    }

    internal static async Task<IResult> ReissueOwnerInvitation(
        Guid clientId, AccessDbContext db, ITenantContext tenant, ICurrentUser user, IDbContextOutbox<AccessDbContext> outbox,
        IOptions<AccessOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var (client, problem) = await EnterAsync(clientId, db, tenant, ct);
        if (client is null) return problem!;
        var owner = await FirstOwnerAsync(db, ct);
        if (owner is null) return Problems.NotFound($"{client.Name} has no Owner.");
        if (owner.Status != UserStatus.Invited)
            return Problems.Conflict($"{owner.Email} has already joined {client.Name}, so there's no invitation to send.");

        var now = clock.GetUtcNow();
        var (link, expiresAt) = await UserEndpoints.ReissueAsync(db, owner, $"{user.Name} (Inventra)", options.Value, now, ct);
        var details = $"New Owner invitation for {owner.Email}. Older links no longer work.";
        db.AuditEntries.Add(AuditEntry.Create(client.TenantId, user.Id, $"{user.Name} (Inventra)", ActorKind.Platform,
            AccessAuditActions.OwnerInvitationReissued, "user", owner.Id, details, null, now));
        await outbox.PublishAsync(new PlatformActivityRecorded(user.Id, user.Name, AccessAuditActions.OwnerInvitationReissued, client.TenantId, details, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.Ok(new OwnerInvitationResponse(client.TenantId, owner.Email, owner.Name, owner.Status, expiresAt, link));
    }
}
