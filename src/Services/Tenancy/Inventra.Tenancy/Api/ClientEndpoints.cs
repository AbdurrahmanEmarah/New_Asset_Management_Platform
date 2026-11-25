using System.Net.Mail;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Tenancy;
using Inventra.Tenancy.Data;
using Inventra.Tenancy.Domain;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Tenancy.Api;

public static class ClientEndpoints
{
    public static IEndpointRouteBuilder MapClientEndpoints(this IEndpointRouteBuilder app)
    {
        var clients = app.MapGroup("/clients").WithTags("Clients").RequireAuthorization(PlatformPolicies.Read);

        clients.MapGet("/", ListClients);
        clients.MapGet("/summary", GetSummary);
        clients.MapGet("/{id:guid}", GetClient);
        clients.MapPost("/", CreateClient).RequireAuthorization(PlatformPolicies.ManageClients);
        clients.MapPost("/{id:guid}/suspend", SuspendClient).RequireAuthorization(PlatformPolicies.ManageClients);
        clients.MapPost("/{id:guid}/reactivate", ReactivateClient).RequireAuthorization(PlatformPolicies.ManageClients);
        clients.MapPut("/{id:guid}/plan", ChangePlan).RequireAuthorization(PlatformPolicies.ManageBilling);
        return app;
    }

    /// <param name="status">all (default), active, attention (trial, payment due or near a limit), suspended.</param>
    /// <param name="search">Matches name, sub-domain or owner email.</param>
    internal static async Task<Ok<List<ClientResponse>>> ListClients(TenancyDbContext db, string? status, string? search, CancellationToken ct)
    {
        var query = db.Clients.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(c => EF.Functions.ILike(c.Name, term) || EF.Functions.ILike(c.Slug, term) || EF.Functions.ILike(c.OwnerEmail, term));
        }

        query = status switch
        {
            "active" => query.Where(c => c.Status == ClientStatus.Active),
            "suspended" => query.Where(c => c.Status == ClientStatus.Suspended),
            _ => query,
        };

        var plans = await db.Plans.AsNoTracking().ToDictionaryAsync(p => p.Key, ct);
        var rows = (await query.OrderBy(c => c.Name).ToListAsync(ct))
            .Select(c => ClientResponse.From(c, plans[c.PlanKey]));

        if (status == "attention")
        {
            rows = rows.Where(r => r.Status is "trial" or "payment_due" || r.NearLimit);
        }

        return TypedResults.Ok(rows.ToList());
    }

    internal static async Task<Ok<ClientSummary>> GetSummary(TenancyDbContext db, CancellationToken ct)
    {
        var plans = await db.Plans.AsNoTracking().ToDictionaryAsync(p => p.Key, ct);
        var all = (await db.Clients.AsNoTracking().ToListAsync(ct)).Select(c => (c, r: ClientResponse.From(c, plans[c.PlanKey]))).ToList();
        return TypedResults.Ok(new ClientSummary(
            Active: all.Count(x => x.c.Status is ClientStatus.Active or ClientStatus.PaymentDue),
            Trial: all.Count(x => x.c.Status == ClientStatus.Trial),
            Suspended: all.Count(x => x.c.Status == ClientStatus.Suspended),
            NearLimit: all.Count(x => x.c.Status != ClientStatus.Closed && x.r.NearLimit),
            SeatsInUse: all.Where(x => x.c.Status != ClientStatus.Closed).Sum(x => (long)x.c.UsersUsed)));
    }

    internal static async Task<IResult> GetClient(Guid id, TenancyDbContext db, CancellationToken ct)
    {
        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return Problems.NotFound("No client has this id.");
        var plan = await db.Plans.AsNoTracking().FirstAsync(p => p.Key == client.PlanKey, ct);
        return TypedResults.Ok(ClientResponse.From(client, plan));
    }

    internal static async Task<IResult> CreateClient(
        CreateClientRequest request, TenancyDbContext db, IDbContextOutbox<TenancyDbContext> outbox, ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        var errors = new FieldErrors()
            .Require("name", request.Name, "Company name")
            .Require("ownerName", request.OwnerName, "Owner's name");

        if (request.Name?.Trim().Length > 120) errors.Add("name", "Use 120 characters or fewer.");
        var slug = request.Slug?.Trim().ToLowerInvariant();
        if (Slug.Problem(slug) is { } slugProblem) errors.Add("slug", slugProblem);
        if (string.IsNullOrWhiteSpace(request.Region) || !Regions.All.ContainsKey(request.Region))
            errors.Add("region", "Choose where this client's data is stored.");
        if (!IsEmail(request.OwnerEmail)) errors.Add("ownerEmail", "Enter the owner's email address, e.g. name@company.com.");

        var plan = string.IsNullOrWhiteSpace(request.PlanKey) ? null : await db.Plans.FindAsync([request.PlanKey], ct);
        if (plan is null) errors.Add("planKey", "Choose a plan.");
        if (errors.Any) return errors.ToResult();

        if (await db.Clients.AnyAsync(c => c.Slug == slug, ct)) return SlugTaken(slug!);

        var now = clock.GetUtcNow();
        var client = Client.Create(request.Name!, slug!, request.Region!, plan!, request.OwnerName!, request.OwnerEmail!, now);
        db.Clients.Add(client);
        db.AuditEntries.Add(PlatformAuditEntry.For(user.Id, user.Name, AuditActions.ClientCreated, client,
            $"Created on the {plan!.Name} plan in {Regions.NameOf(client.Region)}. Owner: {client.OwnerName} <{client.OwnerEmail}>.", now));

        await outbox.PublishAsync(new ClientCreated(
            client.Id, client.Name, client.Slug, plan.Key, plan.MaxUsers, client.OwnerName, client.OwnerEmail, now));

        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(TenancyDbContext.SlugIndex))
        {
            return SlugTaken(slug!);
        }

        return TypedResults.Created($"/clients/{client.Id}", ClientResponse.From(client, plan));
    }

    internal static async Task<IResult> SuspendClient(
        Guid id, SuspendClientRequest request, TenancyDbContext db, IDbContextOutbox<TenancyDbContext> outbox, ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            return new FieldErrors().Add("reason", "Say why the client is suspended. Their owner will see this.").ToResult();
        if (request.Reason.Trim().Length > 500)
            return new FieldErrors().Add("reason", "Use 500 characters or fewer.").ToResult();

        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return Problems.NotFound("No client has this id.");
        if (client.CannotSuspendReason() is { } why) return Problems.Conflict(why);

        var now = clock.GetUtcNow();
        client.Suspend(request.Reason, now);
        db.AuditEntries.Add(PlatformAuditEntry.For(user.Id, user.Name, AuditActions.ClientSuspended, client, $"Reason: {client.SuspendedReason}", now));
        await outbox.PublishAsync(new ClientSuspended(client.Id, client.SuspendedReason!, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);

        var plan = await db.Plans.AsNoTracking().FirstAsync(p => p.Key == client.PlanKey, ct);
        return TypedResults.Ok(ClientResponse.From(client, plan));
    }

    internal static async Task<IResult> ReactivateClient(
        Guid id, TenancyDbContext db, IDbContextOutbox<TenancyDbContext> outbox, ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return Problems.NotFound("No client has this id.");
        if (client.CannotReactivateReason() is { } why) return Problems.Conflict(why);

        var plan = await db.Plans.AsNoTracking().FirstAsync(p => p.Key == client.PlanKey, ct);
        var now = clock.GetUtcNow();
        client.Reactivate(plan, now);
        db.AuditEntries.Add(PlatformAuditEntry.For(user.Id, user.Name, AuditActions.ClientReactivated, client, "Access restored.", now));
        await outbox.PublishAsync(new ClientReactivated(client.Id, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.Ok(ClientResponse.From(client, plan));
    }

    internal static async Task<IResult> ChangePlan(
        Guid id, ChangePlanRequest request, TenancyDbContext db, IDbContextOutbox<TenancyDbContext> outbox, ICurrentUser user, TimeProvider clock, CancellationToken ct)
    {
        var target = string.IsNullOrWhiteSpace(request.PlanKey) ? null : await db.Plans.AsNoTracking().FirstOrDefaultAsync(p => p.Key == request.PlanKey, ct);
        if (target is null) return new FieldErrors().Add("planKey", "Choose a plan.").ToResult();

        var client = await db.Clients.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return Problems.NotFound("No client has this id.");
        if (client.CannotChangePlanReason(target) is { } why) return Problems.Conflict(why);

        var from = await db.Plans.AsNoTracking().FirstAsync(p => p.Key == client.PlanKey, ct);
        var now = clock.GetUtcNow();
        client.ChangePlan(target);
        db.AuditEntries.Add(PlatformAuditEntry.For(user.Id, user.Name, AuditActions.PlanChanged, client, $"{from.Name} → {target.Name}.", now));
        await outbox.PublishAsync(new ClientPlanChanged(client.Id, target.Key, target.MaxUsers, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return TypedResults.Ok(ClientResponse.From(client, target));
    }

    private static IResult SlugTaken(string slug) =>
        new FieldErrors().Add("slug", $"\"{slug}\" is already used by another client. Choose another sub-domain.").ToResult();

    private static bool IsEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 254) return false;
        return MailAddress.TryCreate(value.Trim(), out var address)
               && address.Address == value.Trim()
               && address.Host.Contains('.', StringComparison.Ordinal);
    }
}
