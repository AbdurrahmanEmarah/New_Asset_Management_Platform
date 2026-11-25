using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using Inventra.Access.Domain;
using Inventra.Contracts.Access;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class UserTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<Dictionary<string, RoleResponse>> RolesAsync(Company c) =>
        (await Read<List<RoleResponse>>(await api.Client(c.Owner).GetAsync("/roles", Ct))).Where(r => r.BuiltInKey is not null).ToDictionary(r => r.BuiltInKey!);

    private static List<RoleAssignmentRequest> Assign(params Guid[] ids) => ids.Select(id => new RoleAssignmentRequest(id, [])).ToList();

    [Fact]
    public async Task Invite_explains_every_field_problem()
    {
        var company = await api.CreateCompanyAsync();
        var errors = await FieldErrors(await api.Client(company.Owner).PostAsJsonAsync("/users", new InviteUserRequest("not-an-email", new string('x', 200), []), Ct));
        Assert.Equal(["email", "name"], errors.Keys.Order().ToArray());

        errors = await FieldErrors(await api.Client(company.Owner).PostAsJsonAsync("/users", new InviteUserRequest("a@example.test", "A", []), Ct));
        Assert.Equal("Choose at least one role.", errors["roles"][0]);

        errors = await FieldErrors(await api.Client(company.Owner).PostAsJsonAsync("/users", new InviteUserRequest("a@example.test", "A", Assign(Guid.NewGuid())), Ct));
        Assert.Contains("doesn't exist any more", errors["roles"][0]);
    }

    [Fact]
    public async Task Inviting_an_existing_person_says_what_to_do_instead()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await RolesAsync(company);
        var body = new InviteUserRequest("dup@example.test", "Dup", Assign(roles["technician"].Id));
        await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsJsonAsync("/users", body, Ct));
        var errors = await FieldErrors(await api.Client(company.Owner).PostAsJsonAsync("/users", body with { Email = "DUP@example.test" }, Ct));
        Assert.Contains("already been invited. Resend their invitation instead.", errors["email"][0]);
    }

    [Fact]
    public async Task The_plan_seat_limit_blocks_new_invitations_and_reports_usage()
    {
        var company = await api.CreateCompanyAsync(maxUsers: 2);
        var roles = await RolesAsync(company);
        var first = await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsJsonAsync("/users",
            new InviteUserRequest("one@example.test", "One", Assign(roles["viewer"].Id)), Ct));
        await api.Events.WaitForAsync<ClientUsersCounted>(c => c.ClientId == company.Id && c.Seats == 2 && c.Invited == 1);

        var seats = await Read<SeatSummary>(await api.Client(company.Owner).GetAsync("/users/summary", Ct));
        Assert.Equal(new SeatSummary(2, 1, 1, 0, 2, "blocked"), seats);

        var detail = await Problem(await api.Client(company.Owner).PostAsJsonAsync("/users",
            new InviteUserRequest("two@example.test", "Two", Assign(roles["viewer"].Id)), Ct), HttpStatusCode.Conflict);
        Assert.Contains("Your plan allows 2 users and all 2 are in use", detail);

        // Cancelling an invitation frees the seat.
        Assert.Equal(HttpStatusCode.NoContent, (await api.Client(company.Owner).DeleteAsync($"/users/{first.User.Id}/invitation", Ct)).StatusCode);
        await api.Events.WaitForAsync<ClientUsersCounted>(c => c.ClientId == company.Id && c.Seats == 1 && c.Invited == 0);
        await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsJsonAsync("/users",
            new InviteUserRequest("two@example.test", "Two", Assign(roles["viewer"].Id)), Ct));
    }

    [Fact]
    public async Task Deactivating_turns_off_sign_in_and_reactivating_restores_it()
    {
        var company = await api.CreateCompanyAsync();
        var (tech, techId) = await api.AddMemberAsync(company, "technician");

        var user = await Read<UserResponse>(await api.Client(company.Owner).PostAsync($"/users/{techId}/deactivate", null, Ct));
        Assert.Equal(UserStatus.Deactivated, user.Status);
        Assert.Equal(false, api.Directory.EnabledOf(tech.Id));
        Assert.Contains("turned off your access", await Problem(await api.Client(tech).GetAsync("/me", Ct), HttpStatusCode.Forbidden));
        Assert.Contains("already deactivated", await Problem(await api.Client(company.Owner).PostAsync($"/users/{techId}/deactivate", null, Ct), HttpStatusCode.Conflict));

        user = await Read<UserResponse>(await api.Client(company.Owner).PostAsync($"/users/{techId}/reactivate", null, Ct));
        Assert.Equal(UserStatus.Active, user.Status);
        Assert.Equal(true, api.Directory.EnabledOf(tech.Id));
        Assert.Equal(HttpStatusCode.OK, (await api.Client(tech).GetAsync("/me", Ct)).StatusCode);

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit", Ct));
        Assert.Contains(audit, a => a.Action == "user.deactivated" && a.TargetId == techId && a.ActorName == "Mona Haddad");
    }

    [Fact]
    public async Task The_last_owner_cannot_be_deactivated_or_demoted()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await RolesAsync(company);
        var (admin, _) = await api.AddMemberAsync(company, "admin");
        var users = await Read<List<UserResponse>>(await api.Client(company.Owner).GetAsync("/users", Ct));
        var owner = users.Single(u => u.IsOwner);
        Assert.Equal("You can't deactivate yourself. Ask another Admin or an Owner.", owner.CannotDeactivateReason);

        Assert.Contains("Only an Owner can deactivate another Owner", await Problem(await api.Client(admin).PostAsync($"/users/{owner.Id}/deactivate", null, Ct), HttpStatusCode.Conflict));
        Assert.Contains("Only an Owner can change an Owner's roles",
            await Problem(await api.Client(admin).PutAsJsonAsync($"/users/{owner.Id}/roles", new SetUserRolesRequest(Assign(roles["admin"].Id)), Ct), HttpStatusCode.Conflict));
        Assert.Contains("is the only Owner",
            await Problem(await api.Client(company.Owner).PutAsJsonAsync($"/users/{owner.Id}/roles", new SetUserRolesRequest(Assign(roles["admin"].Id)), Ct), HttpStatusCode.Conflict));

        // With a second Owner, the first can step down.
        var (second, secondId) = await api.AddMemberAsync(company, "owner");
        await Read<UserResponse>(await api.Client(second).PutAsJsonAsync($"/users/{owner.Id}/roles", new SetUserRolesRequest(Assign(roles["admin"].Id)), Ct));
        Assert.Contains("Only an Owner can change an Owner's roles",
            await Problem(await api.Client(company.Owner).PutAsJsonAsync($"/users/{secondId}/roles", new SetUserRolesRequest(Assign(roles["admin"].Id)), Ct), HttpStatusCode.Conflict));
        Assert.Contains("is the only Owner",
            await Problem(await api.Client(second).PutAsJsonAsync($"/users/{secondId}/roles", new SetUserRolesRequest(Assign(roles["admin"].Id)), Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Nobody_hands_out_more_than_they_hold()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await RolesAsync(company);
        var peopleManager = await Read<RoleResponse>(await api.Client(company.Owner).PostAsJsonAsync("/roles",
            new RoleRequest("People manager", "Invites people", ["users.manage"]), Ct));
        var (manager, _) = await api.AddMemberWithRolesAsync(company, Assign(peopleManager.Id));

        Assert.Contains("Only an Owner can make someone an Owner",
            await Problem(await api.Client(manager).PostAsJsonAsync("/users", new InviteUserRequest("o@example.test", "O", Assign(roles["owner"].Id)), Ct), HttpStatusCode.Conflict));
        var detail = await Problem(await api.Client(manager).PostAsJsonAsync("/users", new InviteUserRequest("t@example.test", "T", Assign(roles["technician"].Id)), Ct), HttpStatusCode.Conflict);
        Assert.Contains("\"Technician\" includes", detail);
        await Read<InvitationLinkResponse>(await api.Client(manager).PostAsJsonAsync("/users", new InviteUserRequest("p@example.test", "P", Assign(peopleManager.Id)), Ct));
    }

    [Fact]
    public async Task Site_scope_is_set_per_assignment_and_the_widest_scope_wins()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await RolesAsync(company);
        var hq = await Read<SiteResponse>(await api.Client(company.Owner).PostAsJsonAsync("/sites", new SiteRequest("HQ Tower", "HQ", null), Ct));
        var depot = await Read<SiteResponse>(await api.Client(company.Owner).PostAsJsonAsync("/sites", new SiteRequest("North depot", "NORTH", null), Ct));

        var (tech, techId) = await api.AddMemberWithRolesAsync(company, [new(roles["technician"].Id, [hq.Id, depot.Id])]);
        var me = await Read<MeResponse>(await api.Client(tech).GetAsync("/me", Ct));
        var assignment = Assert.Single(me.Roles);
        Assert.False(assignment.AllSites);
        Assert.Equal(new[] { hq.Id, depot.Id }.Order(), assignment.SiteIds.Order());

        var user = await Read<UserResponse>(await api.Client(company.Owner).PutAsJsonAsync($"/users/{techId}/roles",
            new SetUserRolesRequest([new(roles["technician"].Id, [depot.Id]), new(roles["viewer"].Id, [])]), Ct));
        Assert.Equal([depot.Id], user.Roles.Single(r => r.Name == "Technician").SiteIds);
        Assert.True(user.Roles.Single(r => r.Name == "Viewer / Auditor").AllSites);

        var errors = await FieldErrors(await api.Client(company.Owner).PutAsJsonAsync($"/users/{techId}/roles",
            new SetUserRolesRequest([new(roles["technician"].Id, [Guid.NewGuid()])]), Ct));
        Assert.Contains("sites doesn't exist", errors["roles"][0]);
        errors = await FieldErrors(await api.Client(company.Owner).PutAsJsonAsync($"/users/{techId}/roles",
            new SetUserRolesRequest([new(roles["owner"].Id, [hq.Id])]), Ct));
        Assert.Contains("always applies to every site", errors["roles"][0]);
    }

    [Fact]
    public async Task Listing_filters_by_status_and_search_and_needs_the_permission()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await RolesAsync(company);
        await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsJsonAsync("/users",
            new InviteUserRequest("findme@example.test", "Findable Person", Assign(roles["viewer"].Id)), Ct));
        var (tech, _) = await api.AddMemberAsync(company, "technician");

        var invited = await Read<List<UserResponse>>(await api.Client(company.Owner).GetAsync("/users?status=invited", Ct));
        var found = Assert.Single(invited);
        Assert.NotNull(found.InvitationExpiresAt);
        Assert.Single(await Read<List<UserResponse>>(await api.Client(company.Owner).GetAsync("/users?search=findable", Ct)));
        Assert.Equal("Use all, active, invited or deactivated.", (await FieldErrors(await api.Client(company.Owner).GetAsync("/users?status=gone", Ct)))["status"][0]);

        Assert.Contains("\"Invite and manage users\" permission",
            await Problem(await api.Client(tech).GetAsync("/users", Ct), HttpStatusCode.Forbidden));
    }
}
