using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Access.Api;

/// <summary>One role's permissions and where they apply. Empty SiteIds means every site.</summary>
public sealed record RoleGrant(Guid RoleId, string RoleName, IReadOnlyList<string> Permissions, IReadOnlyList<Guid> SiteIds);

/// <summary>
/// Who is acting inside a client for this request: a member of the client, or platform staff
/// under a support pass. Filled in by <see cref="TenantGate"/> before the endpoint runs.
/// </summary>
public sealed class Caller
{
    private ClientAccount? _client;
    private HashSet<string> _permissions = new(StringComparer.Ordinal);

    public ClientAccount Client => _client ?? throw new InvalidOperationException("The tenant gate hasn't run for this endpoint.");
    public Guid TenantId => Client.TenantId;

    /// <summary>The member acting, or null under a support pass.</summary>
    public AppUser? User { get; private set; }

    /// <summary>The support pass in use, or null for a member.</summary>
    public SupportPass? Pass { get; private set; }

    public string ActorId { get; private set; } = "";
    public string ActorName { get; private set; } = "";
    public ActorKind Kind { get; private set; }
    public bool IsOwner { get; private set; }
    public IReadOnlyList<RoleGrant> Grants { get; private set; } = [];
    public IReadOnlyCollection<string> Permissions => _permissions;

    public bool Has(string permission) => IsOwner || _permissions.Contains(permission);

    /// <summary>The sites where this caller has the permission, or null for every site.</summary>
    public IReadOnlySet<Guid>? SitesFor(string permission)
    {
        if (IsOwner || Pass is not null) return null;
        var grants = Grants.Where(g => g.Permissions.Contains(permission)).ToList();
        if (grants.Count == 0) return new HashSet<Guid>();
        return grants.Any(g => g.SiteIds.Count == 0) ? null : grants.SelectMany(g => g.SiteIds).ToHashSet();
    }

    public AuditEntry Audit(string action, string? targetType, Guid? targetId, string details, DateTimeOffset now) =>
        AuditEntry.Create(TenantId, ActorId, ActorName, Kind, action, targetType, targetId, details, Pass?.Id, now);

    internal void ForMember(ClientAccount client, AppUser user, IReadOnlyList<Role> roles)
    {
        _client = client;
        User = user;
        ActorId = user.Id.ToString();
        ActorName = string.IsNullOrWhiteSpace(user.Name) ? user.Email : user.Name;
        Kind = ActorKind.User;
        IsOwner = roles.Any(r => r.IsOwner);
        Grants = roles.Select(r => new RoleGrant(r.Id, r.Name, r.EffectivePermissions, r.SiteIds)).ToList();
        _permissions = roles.SelectMany(r => r.EffectivePermissions).ToHashSet(StringComparer.Ordinal);
    }

    internal void ForSupport(ClientAccount client, SupportPass pass)
    {
        _client = client;
        Pass = pass;
        ActorId = pass.RequestedById;
        ActorName = $"{pass.RequestedByName} (Inventra support)";
        Kind = ActorKind.Support;
        IsOwner = false;
        Grants = [];
        _permissions = Domain.Permissions.All.ToHashSet(StringComparer.Ordinal);
    }
}

/// <summary>
/// Runs before every client-scoped endpoint. It decides who is acting and for which client, points
/// row-level security at that client, and refuses (403 with a plain reason) anyone who may not act.
/// </summary>
internal static class TenantGate
{
    public static RouteGroupBuilder RequireClientAccess(this RouteGroupBuilder group)
    {
        group.RequireAuthorization().ProducesProblem(StatusCodes.Status403Forbidden).AddEndpointFilter(async (context, next) =>
        {
            var refusal = await AdmitAsync(context.HttpContext);
            return refusal ?? await next(context);
        });
        return group;
    }

    /// <summary>Refuses with 403 unless the caller has at least one of these permissions.</summary>
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder endpoint, params string[] anyOf)
    {
        endpoint.AddEndpointFilter(async (context, next) =>
        {
            var caller = context.HttpContext.RequestServices.GetRequiredService<Caller>();
            if (anyOf.Any(caller.Has)) return await next(context);
            var labels = string.Join(" or ", anyOf.Select(p => $"\"{Domain.Permissions.LabelOf(p)}\""));
            return Problems.Forbidden($"You need the {labels} permission for this. Ask your company's Owner or an Admin.");
        });
        return endpoint;
    }

    private static async Task<IResult?> AdmitAsync(HttpContext http)
    {
        var services = http.RequestServices;
        var user = services.GetRequiredService<ICurrentUser>();
        var db = services.GetRequiredService<AccessDbContext>();
        var tenant = services.GetRequiredService<ITenantContext>();
        var caller = services.GetRequiredService<Caller>();
        var clock = services.GetRequiredService<TimeProvider>();
        var ct = http.RequestAborted;

        if (user.IsTenant)
        {
            if (user.TenantId is not { } tenantId)
                return Problems.Forbidden("Your sign-in isn't linked to a company yet. Open the invitation link you were sent to join your company.");

            await tenant.UseAsync(tenantId, ct);
            var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(ct);
            if (client is null)
                return Problems.Forbidden("Your company's account isn't set up in Inventra yet. Try again in a minute; if it keeps happening, contact Inventra support.");
            if (client.CannotSignInReason() is { } suspended) return Problems.Forbidden(suspended);

            var member = await db.Users.FirstOrDefaultAsync(u => u.Subject == user.Id, ct);
            if (member is null)
                return Problems.Forbidden($"You're not a member of {client.Name}. Ask your company's Admin to invite you.");
            if (member.Status == UserStatus.Deactivated)
                return Problems.Forbidden($"An Admin turned off your access to {client.Name}. Ask them to reactivate it.");

            var roleIds = member.Roles.Select(r => r.RoleId).ToList();
            var roles = await db.Roles.AsNoTracking().Where(r => roleIds.Contains(r.Id)).ToListAsync(ct);
            caller.ForMember(client, member, roles);
            return null;
        }

        if (user.IsPlatform)
        {
            var header = http.Request.Headers[SupportPass.Header].ToString();
            if (string.IsNullOrWhiteSpace(header))
                return Problems.Forbidden("Platform staff can't see client data without a support pass. Request one from the client's page in the admin console.");
            if (SupportPass.ParseHeader(header) is not { } parsed)
                return Problems.Forbidden($"The {SupportPass.Header} header isn't a valid support pass. Use the value shown when the pass was opened.");
            var (tenantId, passId) = parsed;

            await tenant.UseAsync(tenantId, ct);
            var pass = await db.SupportPasses.AsNoTracking().FirstOrDefaultAsync(p => p.Id == passId, ct);
            var now = clock.GetUtcNow();
            if (pass is null) return Problems.Forbidden("This support pass doesn't exist for that client. Request a new one.");
            if (pass.CannotUseReason(user.Id, now) is { } why) return Problems.Forbidden(why);
            if (pass.Access == SupportAccess.Read && !HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
                return Problems.Forbidden("This support pass is read-only. Ask the Platform Owner for a pass with change access.");

            var client = await db.Clients.AsNoTracking().FirstAsync(ct);
            caller.ForSupport(client, pass);

            // Every request under a pass is recorded in the client's own audit log, reads included.
            db.AuditEntries.Add(caller.Audit(AccessAuditActions.SupportRequest, "support_pass", pass.Id,
                $"{http.Request.Method} {http.Request.Path}{http.Request.QueryString}", now));
            await db.SaveChangesAsync(ct);
            return null;
        }

        return Problems.Forbidden("Sign in with your company account to continue.");
    }
}
