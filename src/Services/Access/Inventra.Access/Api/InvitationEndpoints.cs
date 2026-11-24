using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.Access.Identity;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Api;

/// <summary>
/// Joining a company. These endpoints don't need membership yet, only a client-realm sign-in.
/// The token travels in the body, never in the URL.
/// </summary>
public static class InvitationEndpoints
{
    public static IEndpointRouteBuilder MapInvitationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/invitations").WithTags("Invitations").RequireAuthorization();
        group.MapPost("/preview", Preview).Produces<InvitationPreviewResponse>().ProducesValidationProblem().ProducesProblem(404).WithSummary("Who invited you, to which company and with which roles. Shows why it can't be accepted, if so.");
        group.MapPost("/accept", Accept).Produces<AcceptInvitationResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409).ProducesProblem(503).WithSummary("Joins the company. Afterwards, sign in again so the token carries the company.");
        return app;
    }

    private sealed record Found(Invitation Invitation, AppUser User, ClientAccount Client);

    private static async Task<(Found? Found, IResult? Problem)> FindAsync(string? token, AccessDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        if (Invitation.TenantOf(token) is not { } tenantId)
            return (null, new FieldErrors().Add("token", "This invitation link isn't complete. Open the link from your invitation again, or copy all of it.").ToResult());

        await tenant.UseAsync(tenantId, ct);
        var hash = Invitation.Hash(token!);
        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
        if (invitation is null)
            return (null, Problems.NotFound("This invitation link isn't valid. Ask your company's Admin to send you a new invitation."));

        var user = await db.Users.FirstAsync(u => u.Id == invitation.UserId, ct);
        var client = await db.Clients.FirstAsync(ct);
        return (new Found(invitation, user, client), null);
    }

    private static string? SignInProblem(ICurrentUser user, Guid tenantId)
    {
        if (!user.IsTenant) return "Sign in with your company account, not an Inventra staff account, to accept an invitation.";
        if (user.TenantId is { } current && current != tenantId)
            return "Your sign-in already belongs to another company in Inventra. One sign-in can belong to one company, so use a different email address for this invitation.";
        return null;
    }

    internal static async Task<IResult> Preview(
        InvitationTokenRequest request, AccessDbContext db, ITenantContext tenant, ICurrentUser user,
        IOptions<AccessOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var (found, problem) = await FindAsync(request.Token, db, tenant, ct);
        if (found is null) return problem!;

        var (invitation, invitee, client) = found;
        var roleIds = invitee.Roles.Select(r => r.RoleId).ToList();
        var roles = await db.Roles.AsNoTracking().Where(r => roleIds.Contains(r.Id)).Select(r => r.Name).ToListAsync(ct);
        var cannot = SignInProblem(user, client.TenantId)
                     ?? client.CannotSignInReason()
                     ?? invitation.CannotAcceptReason(clock.GetUtcNow(), user.Email, user.EmailVerified, options.Value.RequireVerifiedEmail)
                     ?? invitee.CannotJoinReason(user.Id);

        return TypedResults.Ok(new InvitationPreviewResponse(
            client.TenantId, client.Name, invitation.Email, invitee.Name, invitation.CreatedByName, roles.Order().ToList(), invitation.ExpiresAt, cannot));
    }

    internal static async Task<IResult> Accept(
        InvitationTokenRequest request, AccessDbContext db, ITenantContext tenant, ICurrentUser user, IIdentityDirectory directory,
        IDbContextOutbox<AccessDbContext> outbox, IOptions<AccessOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var (found, problem) = await FindAsync(request.Token, db, tenant, ct);
        if (found is null) return problem!;

        var (invitation, invitee, client) = found;
        var now = clock.GetUtcNow();
        var cannot = SignInProblem(user, client.TenantId)
                     ?? client.CannotSignInReason()
                     ?? invitation.CannotAcceptReason(now, user.Email, user.EmailVerified, options.Value.RequireVerifiedEmail)
                     ?? invitee.CannotJoinReason(user.Id);
        if (cannot is not null) return Problems.Conflict(cannot);

        if (await db.Users.AnyAsync(u => u.Subject == user.Id && u.Id != invitee.Id, ct))
            return Problems.Conflict("Your sign-in is already linked to another person in this company. Sign out and sign in with the invited email address.");

        try
        {
            await directory.LinkToClientAsync(user.Id, client.TenantId, ct);
        }
        catch (IdentityDirectoryException ex)
        {
            return Problems.Unavailable(ex.Message);
        }

        invitee.Join(user.Id, user.Name, now);
        invitation.Accept(now);
        db.AuditEntries.Add(AuditEntry.Create(client.TenantId, invitee.Id.ToString(), UserViews.DisplayName(invitee), ActorKind.User,
            AccessAuditActions.UserJoined, "user", invitee.Id, $"{invitee.Email} accepted the invitation from {invitation.CreatedByName}.", null, now));
        await Seats.SaveAndReportAsync(db, outbox, client, now, ct);

        return TypedResults.Ok(new AcceptInvitationResponse(client.TenantId, client.Name, invitee.Id, SignInAgain: user.TenantId != client.TenantId));
    }
}
