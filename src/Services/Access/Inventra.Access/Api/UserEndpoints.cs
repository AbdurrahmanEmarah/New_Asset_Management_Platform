using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.Access.Identity;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Api;

public static class UserEndpoints
{
    public static RouteGroupBuilder MapUserEndpoints(this RouteGroupBuilder app)
    {
        var users = app.MapGroup("/users").WithTags("Users").RequirePermissionOnGroup(Permissions.UsersManage);
        users.MapGet("/", ListUsers).Produces<List<UserResponse>>().ProducesValidationProblem().WithSummary("People in the company. status: all (default), active, invited, deactivated.");
        users.MapGet("/summary", GetSeats).Produces<SeatSummary>().WithSummary("Seats in use against the plan's user limit.");
        users.MapGet("/{id:guid}", GetUser).Produces<UserResponse>().ProducesProblem(404);
        users.MapPost("/", InviteUser).Produces<InvitationLinkResponse>(201).ProducesValidationProblem().ProducesProblem(409).WithSummary("Invites a person by email. The response holds the invitation link (shown once).");
        users.MapPost("/{id:guid}/invitation", ResendInvitation).Produces<InvitationLinkResponse>().ProducesProblem(404).ProducesProblem(409).WithSummary("Replaces the open invitation with a new link.");
        users.MapDelete("/{id:guid}/invitation", CancelInvitation).Produces(204).ProducesProblem(404).ProducesProblem(409).WithSummary("Cancels the invitation of someone who hasn't joined, and frees their seat.");
        users.MapPost("/{id:guid}/deactivate", DeactivateUser).Produces<UserResponse>().ProducesProblem(404).ProducesProblem(409).ProducesProblem(503);
        users.MapPost("/{id:guid}/reactivate", ReactivateUser).Produces<UserResponse>().ProducesProblem(404).ProducesProblem(409).ProducesProblem(503);
        users.MapPut("/{id:guid}/roles", SetRoles).Produces<UserResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409);
        return app;
    }

    /// <summary>Applies one permission to every endpoint in the group.</summary>
    internal static RouteGroupBuilder RequirePermissionOnGroup(this RouteGroupBuilder group, string permission)
    {
        group.AddEndpointFilter(async (context, next) =>
        {
            var caller = context.HttpContext.RequestServices.GetRequiredService<Caller>();
            return caller.Has(permission)
                ? await next(context)
                : Problems.Forbidden($"You need the \"{Permissions.LabelOf(permission)}\" permission for this. Ask your company's Owner or an Admin.");
        });
        return group;
    }

    internal static async Task<IResult> ListUsers(string? status, string? search, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var query = db.Users.AsNoTracking();
        query = status switch
        {
            "active" => query.Where(u => u.Status == UserStatus.Active),
            "invited" => query.Where(u => u.Status == UserStatus.Invited),
            "deactivated" => query.Where(u => u.Status == UserStatus.Deactivated),
            null or "" or "all" => query,
            _ => null!,
        };
        if (query is null) return new FieldErrors().Add("status", "Use all, active, invited or deactivated.").ToResult();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(u => EF.Functions.ILike(u.Name, term) || EF.Functions.ILike(u.Email, term));
        }

        var users = await query.OrderBy(u => u.Name).ThenBy(u => u.Email).ToListAsync(ct);
        var roles = await db.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, ct);
        var owners = await OwnerFacts.LoadAsync(db, ct);
        var now = clock.GetUtcNow();
        var invitations = (await db.Invitations.AsNoTracking()
                .Where(i => i.Status == InvitationStatus.Pending && i.ExpiresAt > now).ToListAsync(ct))
            .GroupBy(i => i.UserId).ToDictionary(g => g.Key, g => g.MaxBy(i => i.CreatedAt));

        return TypedResults.Ok(users.Select(u => UserViews.ToResponse(u, roles, owners, caller, invitations.GetValueOrDefault(u.Id))).ToList());
    }

    internal static async Task<IResult> GetSeats(Caller caller, AccessDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await Seats.CountAsync(db, caller.Client, ct));

    internal static async Task<IResult> GetUser(Guid id, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();
        return TypedResults.Ok(await UserViews.LoadResponseAsync(db, user, caller, clock.GetUtcNow(), ct));
    }

    internal static async Task<IResult> InviteUser(
        InviteUserRequest request, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox,
        IOptions<AccessOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var errors = new FieldErrors();
        if (!Email.IsValid(request.Email)) errors.Add("email", "Enter the person's email address, e.g. name@company.com.");
        if (request.Name?.Trim().Length > AppUser.NameMax) errors.Add("name", $"Use {AppUser.NameMax} characters or fewer.");
        if (errors.Any) return errors.ToResult();

        var email = request.Email!.Trim().ToLowerInvariant();
        var existing = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email, ct);
        if (existing is not null) return EmailTaken(existing);

        var (roles, problem) = await RoleAssignment.ResolveAsync(db, request.RoleIds, caller, ct);
        if (problem is not null) return problem;

        var seats = await Seats.CountAsync(db, caller.Client, ct);
        if (caller.Client.CannotAddSeatReason(seats.Seats) is { } full) return Problems.Conflict(full);

        var now = clock.GetUtcNow();
        var user = AppUser.Invite(caller.TenantId, email, request.Name ?? "", roles!, caller.ActorName, now);
        var (invitation, token) = Invitation.Create(user, caller.ActorName, now);
        db.Users.Add(user);
        db.Invitations.Add(invitation);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.UserInvited, "user", user.Id,
            $"Invited {email} as {string.Join(", ", roles!.Select(r => r.Name))}.", now));

        try
        {
            await Seats.SaveAndReportAsync(db, outbox, caller.Client, now, ct);
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(AccessDbContext.UserEmailIndex))
        {
            return new FieldErrors().Add("email", $"{email} is already in your company.").ToResult();
        }

        return TypedResults.Created($"/users/{user.Id}", new InvitationLinkResponse(
            await UserViews.LoadResponseAsync(db, user, caller, now, ct), options.Value.AcceptUrl(token), invitation.ExpiresAt));
    }

    internal static async Task<IResult> ResendInvitation(
        Guid id, Caller caller, AccessDbContext db, IOptions<AccessOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();
        if (user.CannotResendInvitationReason() is { } why) return Problems.Conflict(why);

        var owners = await OwnerFacts.LoadAsync(db, ct);
        if (owners.IsOwner(user) && !caller.IsOwner && caller.Pass is null)
            return Problems.Conflict("Only an Owner can resend an Owner's invitation.");

        var now = clock.GetUtcNow();
        var (link, expiresAt) = await ReissueAsync(db, user, caller.ActorName, options.Value, now, ct);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.InvitationResent, "user", user.Id, $"Sent a new invitation to {user.Email}. Older links no longer work.", now));
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new InvitationLinkResponse(await UserViews.LoadResponseAsync(db, user, caller, now, ct), link, expiresAt));
    }

    /// <summary>Cancels the person's open invitations and makes a new one. The caller saves.</summary>
    internal static async Task<(string Link, DateTimeOffset ExpiresAt)> ReissueAsync(
        AccessDbContext db, AppUser user, string byName, AccessOptions options, DateTimeOffset now, CancellationToken ct)
    {
        foreach (var old in await db.Invitations.Where(i => i.UserId == user.Id && i.Status == InvitationStatus.Pending).ToListAsync(ct)) old.Cancel();
        var (invitation, token) = Invitation.Create(user, byName, now);
        db.Invitations.Add(invitation);
        return (options.AcceptUrl(token), invitation.ExpiresAt);
    }

    internal static async Task<IResult> CancelInvitation(
        Guid id, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();
        if (user.CannotCancelInvitationReason() is { } why) return Problems.Conflict(why);

        var owners = await OwnerFacts.LoadAsync(db, ct);
        if (owners.IsOwner(user) && !caller.IsOwner) return Problems.Conflict("Only an Owner can cancel an Owner's invitation.");
        if (owners.IsLastOwner(user))
            return Problems.Conflict($"{UserViews.DisplayName(user)} is the company's only Owner. Make someone else an Owner first.");

        var now = clock.GetUtcNow();
        db.Users.Remove(user);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.InvitationCancelled, "user", user.Id, $"Cancelled the invitation for {user.Email}.", now));
        await Seats.SaveAndReportAsync(db, outbox, caller.Client, now, ct);
        return TypedResults.NoContent();
    }

    internal static async Task<IResult> DeactivateUser(
        Guid id, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, IIdentityDirectory directory, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();

        var owners = await OwnerFacts.LoadAsync(db, ct);
        if (user.CannotDeactivateReason(owners.IsOwner(user), owners.ActiveOwners, caller.IsOwner, caller.User?.Id) is { } why)
            return Problems.Conflict(why);

        try
        {
            if (user.Subject is { } subject) await directory.SetSignInEnabledAsync(subject, false, ct);
        }
        catch (IdentityDirectoryException ex)
        {
            return Problems.Unavailable(ex.Message);
        }

        var now = clock.GetUtcNow();
        user.Deactivate(caller.ActorName, now);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.UserDeactivated, "user", user.Id, $"Deactivated {user.Email}. They can no longer sign in.", now));
        await Seats.SaveAndReportAsync(db, outbox, caller.Client, now, ct);
        return TypedResults.Ok(await UserViews.LoadResponseAsync(db, user, caller, now, ct));
    }

    internal static async Task<IResult> ReactivateUser(
        Guid id, Caller caller, AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, IIdentityDirectory directory, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();
        if (user.CannotReactivateReason() is { } why) return Problems.Conflict(why);

        var owners = await OwnerFacts.LoadAsync(db, ct);
        if (owners.IsOwner(user) && !caller.IsOwner) return Problems.Conflict("Only an Owner can reactivate an Owner.");

        var seats = await Seats.CountAsync(db, caller.Client, ct);
        if (caller.Client.CannotAddSeatReason(seats.Seats) is { } full) return Problems.Conflict(full);

        try
        {
            if (user.Subject is { } subject) await directory.SetSignInEnabledAsync(subject, true, ct);
        }
        catch (IdentityDirectoryException ex)
        {
            return Problems.Unavailable(ex.Message);
        }

        var now = clock.GetUtcNow();
        user.Reactivate();
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.UserReactivated, "user", user.Id, $"Reactivated {user.Email}.", now));
        await Seats.SaveAndReportAsync(db, outbox, caller.Client, now, ct);
        return TypedResults.Ok(await UserViews.LoadResponseAsync(db, user, caller, now, ct));
    }

    internal static async Task<IResult> SetRoles(Guid id, SetUserRolesRequest request, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NoSuchUser();

        var owners = await OwnerFacts.LoadAsync(db, ct);
        if (UserViews.CannotChangeRolesReason(user, owners, caller) is { } why) return Problems.Conflict(why);

        var (roles, problem) = await RoleAssignment.ResolveAsync(db, request.RoleIds, caller, ct);
        if (problem is not null) return problem;

        var keepsOwner = roles!.Any(r => r.Id == owners.OwnerRoleId);
        if (owners.IsOwner(user) && !keepsOwner && owners.IsLastOwner(user))
            return Problems.Conflict($"{UserViews.DisplayName(user)} is the only Owner. Make someone else an Owner first.");

        var allRoles = await db.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, ct);
        var before = string.Join(", ", user.Roles.Select(r => allRoles.TryGetValue(r.RoleId, out var role) ? role.Name : "?").Order());
        user.SetRoles(roles!);
        var after = string.Join(", ", roles!.Select(r => r.Name).Order());

        var now = clock.GetUtcNow();
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.UserRolesChanged, "user", user.Id, $"{user.Email}: {before} → {after}.", now));
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(await UserViews.LoadResponseAsync(db, user, caller, now, ct));
    }

    private static IResult NoSuchUser() => Problems.NotFound("No person in your company has this id. They may have been removed.");

    private static IResult EmailTaken(AppUser existing) => new FieldErrors().Add("email", existing.Status switch
    {
        UserStatus.Invited => $"{existing.Email} has already been invited. Resend their invitation instead.",
        UserStatus.Deactivated => $"{existing.Email} was deactivated. Reactivate them instead.",
        _ => $"{existing.Email} is already in your company.",
    }).ToResult();
}
