using System.Net.Mail;
using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Http;
using Inventra.Contracts.Access;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Api;

public sealed class AccessOptions
{
    public const string Section = "Access";

    /// <summary>The client web app. Invitation links point to {WebAppUrl}/join#{token}.</summary>
    public string WebAppUrl { get; set; } = "http://localhost:5174";

    /// <summary>Accept an invitation only from a sign-in whose email the identity provider verified.</summary>
    public bool RequireVerifiedEmail { get; set; } = true;

    /// <summary>Local development only: write invitation links to the log, since no email is sent yet.</summary>
    public bool LogInvitationLinks { get; set; }

    /// <summary>The token goes in the fragment, so it never reaches a server log.</summary>
    public string AcceptUrl(string token) => $"{WebAppUrl.TrimEnd('/')}/join#{token}";
}

/// <summary>Seats: active users plus open invitations, counted against the plan's limit.</summary>
internal static class Seats
{
    /// <summary>Counts seats, including changes this request has made but not saved yet.</summary>
    public static async Task<SeatSummary> CountAsync(AccessDbContext db, ClientAccount client, CancellationToken ct)
    {
        var statuses = await db.Users.AsNoTracking().Select(u => new { u.Id, u.Status }).ToDictionaryAsync(u => u.Id, u => (UserStatus?)u.Status, ct);
        foreach (var entry in db.ChangeTracker.Entries<AppUser>())
        {
            statuses[entry.Entity.Id] = entry.State == EntityState.Deleted ? null : entry.Entity.Status;
        }

        var active = statuses.Values.Count(s => s == UserStatus.Active);
        var invited = statuses.Values.Count(s => s == UserStatus.Invited);
        var deactivated = statuses.Values.Count(s => s == UserStatus.Deactivated);
        var seats = active + invited;
        return new SeatSummary(seats, active, invited, deactivated, client.MaxUsers, client.SeatState(seats));
    }

    /// <summary>
    /// Saves the request's changes and, in the same transaction, queues the new seat count for
    /// Tenancy (the outbox). Either both happen or neither does.
    /// </summary>
    public static async Task SaveAndReportAsync(AccessDbContext db, IDbContextOutbox<AccessDbContext> outbox, ClientAccount client, DateTimeOffset now, CancellationToken ct)
    {
        var seats = await CountAsync(db, client, ct);
        await outbox.PublishAsync(new ClientUsersCounted(client.TenantId, seats.Seats, seats.Active, seats.Invited, now));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
    }
}

/// <summary>Facts about the client's Owners, needed by the at-least-one-Owner rule.</summary>
internal sealed record OwnerFacts(Guid OwnerRoleId, int ActiveOwners)
{
    public static async Task<OwnerFacts> LoadAsync(AccessDbContext db, CancellationToken ct)
    {
        var ownerRoleId = await db.Roles.Where(r => r.BuiltInKey == BuiltInRoles.Owner).Select(r => r.Id).FirstAsync(ct);
        var active = await db.Users.CountAsync(u => u.Status == UserStatus.Active && u.Roles.Any(r => r.RoleId == ownerRoleId), ct);
        return new OwnerFacts(ownerRoleId, active);
    }

    public bool IsOwner(AppUser user) => user.HasRole(OwnerRoleId);

    /// <summary>True when this user is the only Owner who can still sign in (counting an invited sole Owner too).</summary>
    public bool IsLastOwner(AppUser user) =>
        IsOwner(user) && (user.Status == UserStatus.Active ? ActiveOwners <= 1 : ActiveOwners == 0);
}

internal static class UserViews
{
    public static string? CannotChangeRolesReason(AppUser user, OwnerFacts owners, Caller caller)
    {
        if (user.Status == UserStatus.Deactivated) return $"Reactivate {DisplayName(user)} first.";
        if (owners.IsOwner(user) && !caller.IsOwner) return $"{DisplayName(user)} is an Owner. Only an Owner can change an Owner's roles.";
        return null;
    }

    public static string DisplayName(AppUser user) => string.IsNullOrWhiteSpace(user.Name) ? user.Email : user.Name;

    public static UserResponse ToResponse(AppUser u, IReadOnlyDictionary<Guid, Role> roles, OwnerFacts owners, Caller caller, Invitation? openInvitation) => new(
        u.Id, u.Email, u.Name, u.Status, owners.IsOwner(u),
        u.Roles.Select(a => roles.TryGetValue(a.RoleId, out var role)
                ? new AssignedRole(role.Id, role.Name, role.Kind, a.SiteIds.Count == 0, a.SiteIds)
                : new AssignedRole(a.RoleId, "(deleted role)", "custom", a.SiteIds.Count == 0, a.SiteIds))
            .OrderBy(r => r.Name).ToList(),
        u.InvitedAt, u.InvitedByName, openInvitation?.ExpiresAt, u.JoinedAt, u.DeactivatedAt, u.DeactivatedByName,
        u.CannotDeactivateReason(owners.IsOwner(u), owners.ActiveOwners, caller.IsOwner, caller.User?.Id),
        CannotChangeRolesReason(u, owners, caller));

    public static async Task<UserResponse> LoadResponseAsync(AccessDbContext db, AppUser user, Caller caller, DateTimeOffset now, CancellationToken ct)
    {
        var roles = await db.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, ct);
        var owners = await OwnerFacts.LoadAsync(db, ct);
        var invitation = await db.Invitations.AsNoTracking()
            .Where(i => i.UserId == user.Id && i.Status == InvitationStatus.Pending && i.ExpiresAt > now)
            .OrderByDescending(i => i.CreatedAt).FirstOrDefaultAsync(ct);
        return ToResponse(user, roles, owners, caller, invitation);
    }
}

internal static class RoleRules
{
    /// <summary>
    /// Checks the role assignments someone may be given by this caller. Returns the roles and
    /// assignments, or the problem to send back. Rules: at least one role; chosen sites must exist;
    /// the Owner role applies everywhere; only an Owner makes Owners; a non-Owner can only give roles
    /// whose permissions they have themselves (no one can hand out more than they hold).
    /// </summary>
    public static async Task<(List<Role>? Roles, List<Domain.RoleAssignment>? Assignments, IResult? Problem)> ResolveAsync(
        AccessDbContext db, IReadOnlyList<RoleAssignmentRequest>? requested, Caller caller, CancellationToken ct)
    {
        if (requested is null || requested.Count == 0)
            return (null, null, new FieldErrors().Add("roles", "Choose at least one role.").ToResult());
        if (requested.GroupBy(r => r.RoleId).Any(g => g.Count() > 1))
            return (null, null, new FieldErrors().Add("roles", "Each role can be chosen once. Put all its sites on that one entry.").ToResult());

        var ids = requested.Select(r => r.RoleId).ToList();
        var roles = await db.Roles.AsNoTracking().Where(r => ids.Contains(r.Id)).ToListAsync(ct);
        if (roles.Count != ids.Count)
            return (null, null, new FieldErrors().Add("roles", "One of the chosen roles doesn't exist any more. Reload the page and choose again.").ToResult());

        var siteIds = requested.SelectMany(r => r.SiteIds ?? []).Distinct().ToList();
        if (siteIds.Count > 0 && await db.Sites.CountAsync(s => siteIds.Contains(s.Id), ct) != siteIds.Count)
            return (null, null, new FieldErrors().Add("roles", "One of the chosen sites doesn't exist. Reload the page and choose again.").ToResult());

        var owner = roles.FirstOrDefault(r => r.IsOwner);
        if (owner is not null && requested.Single(r => r.RoleId == owner.Id).SiteIds is { Count: > 0 })
            return (null, null, new FieldErrors().Add("roles", "The Owner role always applies to every site. Leave its sites empty.").ToResult());

        var assignments = requested.Select(r => new Domain.RoleAssignment(r.RoleId, (r.SiteIds ?? []).Distinct().ToList())).ToList();
        var (checkedRoles, problem) = CheckGrantable(roles, caller);
        return (checkedRoles, problem is null ? assignments : null, problem);
    }

    private static (List<Role>? Roles, IResult? Problem) CheckGrantable(List<Role> roles, Caller caller)
    {
        if (roles.Any(r => r.IsOwner) && !caller.IsOwner)
            return (null, Problems.Conflict("Only an Owner can make someone an Owner."));

        if (!caller.IsOwner)
        {
            foreach (var role in roles)
            {
                var missing = role.EffectivePermissions.Where(p => !caller.Has(p)).ToList();
                if (missing.Count > 0)
                {
                    return (null, Problems.Conflict(
                        $"You can only give roles whose permissions you have yourself. \"{role.Name}\" includes {Describe(missing)}, which you don't have."));
                }
            }
        }

        return (roles, null);
    }

    public static string Describe(IEnumerable<string> permissions) =>
        string.Join(", ", permissions.Select(p => $"\"{Domain.Permissions.LabelOf(p)}\""));
}

internal static class Email
{
    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 254) return false;
        return MailAddress.TryCreate(value.Trim(), out var address)
               && address.Address == value.Trim()
               && address.Host.Contains('.', StringComparison.Ordinal);
    }
}
