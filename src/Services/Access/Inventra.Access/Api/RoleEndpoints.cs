using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Http;
using Microsoft.EntityFrameworkCore;

namespace Inventra.Access.Api;

public static class RoleEndpoints
{
    public static RouteGroupBuilder MapRoleEndpoints(this RouteGroupBuilder app)
    {
        var roles = app.MapGroup("/roles").WithTags("Roles");
        roles.MapGet("/", ListRoles).Produces<List<RoleResponse>>().RequirePermission(Permissions.RolesManage, Permissions.UsersManage);
        roles.MapGet("/{id:guid}", GetRole).Produces<RoleResponse>().ProducesProblem(404).RequirePermission(Permissions.RolesManage, Permissions.UsersManage);
        roles.MapPost("/", CreateRole).Produces<RoleResponse>(201).ProducesValidationProblem().ProducesProblem(409).RequirePermission(Permissions.RolesManage);
        roles.MapPut("/{id:guid}", UpdateRole).Produces<RoleResponse>().ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409).RequirePermission(Permissions.RolesManage);
        roles.MapPost("/{id:guid}/copy", CopyRole).Produces<RoleResponse>(201).ProducesValidationProblem().ProducesProblem(404).ProducesProblem(409).RequirePermission(Permissions.RolesManage)
            .WithSummary("Makes an editable custom role with the same permissions (the mockup's Duplicate).");
        roles.MapDelete("/{id:guid}", DeleteRole).Produces(204).ProducesProblem(404).ProducesProblem(409).RequirePermission(Permissions.RolesManage);
        return app;
    }

    internal static async Task<IResult> ListRoles(AccessDbContext db, CancellationToken ct)
    {
        var members = await MemberCountsAsync(db, ct);
        var all = await db.Roles.AsNoTracking().ToListAsync(ct);
        var order = BuiltInRoles.All.Select((r, i) => (r.Key, i)).ToDictionary(x => x.Key, x => x.i);
        return TypedResults.Ok(all
            .OrderBy(r => r.BuiltInKey is { } k ? order.GetValueOrDefault(k, 99) : 100)
            .ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(r => RoleResponse.From(r, members.GetValueOrDefault(r.Id)))
            .ToList());
    }

    internal static async Task<IResult> GetRole(Guid id, AccessDbContext db, CancellationToken ct)
    {
        var role = await db.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (role is null) return Problems.NotFound("No role has this id. It may have been deleted.");
        return TypedResults.Ok(RoleResponse.From(role, await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct)));
    }

    internal static async Task<IResult> CreateRole(RoleRequest request, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (await ValidateAsync(request, db, excludingRoleId: null, ct) is { } invalid) return invalid;
        var permissions = request.Permissions ?? [];
        if (EscalationProblem(caller, permissions) is { } escalation) return escalation;

        var now = clock.GetUtcNow();
        var role = Role.Custom(caller.TenantId, request.Name!, request.Description ?? "", permissions, now);
        db.Roles.Add(role);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.RoleCreated, "role", role.Id,
            $"Created \"{role.Name}\" with {Summary(role)}.", now));
        if (await SaveAsync(db, role.Name, ct) is { } taken) return taken;
        return TypedResults.Created($"/roles/{role.Id}", RoleResponse.From(role, 0));
    }

    internal static async Task<IResult> UpdateRole(Guid id, RoleRequest request, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (role is null) return Problems.NotFound("No role has this id. It may have been deleted.");
        if (role.CannotEditReason() is { } why) return Problems.Conflict(why);
        if (await ValidateAsync(request, db, excludingRoleId: id, ct) is { } invalid) return invalid;

        var permissions = request.Permissions ?? [];
        var added = permissions.Except(role.Permissions).ToList();
        if (EscalationProblem(caller, added) is { } escalation) return escalation;

        var before = Summary(role);
        var removed = role.Permissions.Except(permissions).ToList();
        role.Update(request.Name!, request.Description ?? "", permissions, clock.GetUtcNow());

        var changes = new List<string>();
        if (added.Count > 0) changes.Add($"added {RoleRules.Describe(added)}");
        if (removed.Count > 0) changes.Add($"removed {RoleRules.Describe(removed)}");
        changes.Add($"was {before}, now {Summary(role)}");
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.RoleUpdated, "role", role.Id, $"\"{role.Name}\": {string.Join("; ", changes)}.", clock.GetUtcNow()));

        if (await SaveAsync(db, role.Name, ct) is { } taken) return taken;
        return TypedResults.Ok(RoleResponse.From(role, await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct)));
    }

    internal static async Task<IResult> CopyRole(Guid id, CopyRoleRequest request, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var source = await db.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (source is null) return Problems.NotFound("No role has this id. It may have been deleted.");
        if (EscalationProblem(caller, source.EffectivePermissions) is { } escalation) return escalation;

        var name = string.IsNullOrWhiteSpace(request.Name) ? await FreeCopyNameAsync(db, source.Name, ct) : request.Name.Trim();
        if (name.Length > Role.NameMax) return new FieldErrors().Add("name", $"Use {Role.NameMax} characters or fewer.").ToResult();

        var now = clock.GetUtcNow();
        var copy = Role.Custom(caller.TenantId, name, source.Description, source.EffectivePermissions, now);
        db.Roles.Add(copy);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.RoleCreated, "role", copy.Id, $"Copied \"{source.Name}\" as \"{copy.Name}\" with {Summary(copy)}.", now));
        if (await SaveAsync(db, copy.Name, ct) is { } taken) return taken;
        return TypedResults.Created($"/roles/{copy.Id}", RoleResponse.From(copy, 0));
    }

    internal static async Task<IResult> DeleteRole(Guid id, Caller caller, AccessDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (role is null) return Problems.NotFound("No role has this id. It may have been deleted.");
        var members = await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct);
        if (role.CannotDeleteReason(members) is { } why) return Problems.Conflict(why);

        db.Roles.Remove(role);
        db.AuditEntries.Add(caller.Audit(AccessAuditActions.RoleDeleted, "role", role.Id, $"Deleted \"{role.Name}\".", clock.GetUtcNow()));
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    private static async Task<IResult?> ValidateAsync(RoleRequest request, AccessDbContext db, Guid? excludingRoleId, CancellationToken ct)
    {
        var errors = new FieldErrors().Require("name", request.Name, "Role name");
        if (request.Name?.Trim().Length > Role.NameMax) errors.Add("name", $"Use {Role.NameMax} characters or fewer.");
        if (request.Description?.Trim().Length > Role.DescriptionMax) errors.Add("description", $"Use {Role.DescriptionMax} characters or fewer.");

        foreach (var unknown in (request.Permissions ?? []).Where(p => !Permissions.Exists(p)).Distinct())
            errors.Add("permissions", $"\"{unknown}\" isn't a permission. Choose from the list.");

        if (!string.IsNullOrWhiteSpace(request.Name) && !errors.Any)
        {
            var normalized = Role.Normalize(request.Name);
            if (await db.Roles.AnyAsync(r => r.NormalizedName == normalized && r.Id != excludingRoleId, ct))
                errors.Add("name", $"A role called \"{request.Name.Trim()}\" already exists. Choose another name.");
        }

        return errors.Any ? errors.ToResult() : null;
    }

    /// <summary>Nobody but an Owner can put a permission they don't hold into a role.</summary>
    private static IResult? EscalationProblem(Caller caller, IEnumerable<string> permissions)
    {
        if (caller.IsOwner) return null;
        var missing = permissions.Where(p => Permissions.Exists(p) && !caller.Has(p)).Distinct().ToList();
        return missing.Count == 0 ? null : Problems.Conflict(
            $"You can only give permissions you have yourself. You don't have {RoleRules.Describe(missing)}. Ask an Owner to make this change.");
    }

    private static async Task<IResult?> SaveAsync(AccessDbContext db, string name, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            return null;
        }
        catch (DbUpdateException ex) when (ex.IsUniqueViolation(AccessDbContext.RoleNameIndex))
        {
            return new FieldErrors().Add("name", $"A role called \"{name}\" already exists. Choose another name.").ToResult();
        }
    }

    private static async Task<string> FreeCopyNameAsync(AccessDbContext db, string name, CancellationToken ct)
    {
        var taken = (await db.Roles.Select(r => r.NormalizedName).ToListAsync(ct)).ToHashSet();
        var candidate = $"Copy of {name}";
        for (var i = 2; taken.Contains(Role.Normalize(candidate)); i++) candidate = $"Copy of {name} ({i})";
        return candidate.Length > Role.NameMax ? candidate[..Role.NameMax] : candidate;
    }

    private static string Summary(Role role) =>
        $"{role.EffectivePermissions.Count} permissions";

    internal static async Task<Dictionary<Guid, int>> MemberCountsAsync(AccessDbContext db, CancellationToken ct) =>
        await db.UserRoles.GroupBy(ur => ur.RoleId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
}
