using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class RoleTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Owner_is_locked_built_ins_are_editable_and_neither_can_be_deleted()
    {
        var company = await api.CreateCompanyAsync();
        var roles = await Read<List<RoleResponse>>(await api.Client(company.Owner).GetAsync("/roles", Ct));
        var owner = roles.Single(r => r.Kind == "owner");
        var tech = roles.Single(r => r.BuiltInKey == "technician");
        Assert.Contains("can't be edited", owner.CannotEditReason);
        Assert.Null(tech.CannotEditReason);
        Assert.Contains("built-in role", tech.CannotDeleteReason);

        Assert.Contains("can't be edited", await Problem(await api.Client(company.Owner).PutAsJsonAsync($"/roles/{owner.Id}",
            new RoleRequest("Boss", "", []), Ct), HttpStatusCode.Conflict));

        var edited = await Read<RoleResponse>(await api.Client(company.Owner).PutAsJsonAsync($"/roles/{tech.Id}",
            new RoleRequest("Technician", tech.Description, [.. tech.Permissions, "checklists.manage"], tech.Version), Ct));
        Assert.Contains("checklists.manage", edited.Permissions);
        Assert.Contains("built-in role", await Problem(await api.Client(company.Owner).DeleteAsync($"/roles/{tech.Id}", Ct), HttpStatusCode.Conflict));

        var audit = await Read<List<AuditEntryResponse>>(await api.Client(company.Owner).GetAsync("/audit", Ct));
        Assert.Contains(audit, a => a.Action == "role.updated" && a.Details.Contains("Edit inspection checklists"));
    }

    [Fact]
    public async Task Custom_roles_are_validated_copied_and_deleted_when_unused()
    {
        var company = await api.CreateCompanyAsync();
        var client = api.Client(company.Owner);

        var errors = await FieldErrors(await client.PostAsJsonAsync("/roles", new RoleRequest("", "", ["assets.fly"]), Ct));
        Assert.Equal("Role name is required.", errors["name"][0]);
        Assert.Contains("\"assets.fly\" isn't a permission", errors["permissions"][0]);
        errors = await FieldErrors(await client.PostAsJsonAsync("/roles", new RoleRequest("technician", "", []), Ct));
        Assert.Contains("already exists", errors["name"][0]);

        var role = await Read<RoleResponse>(await client.PostAsJsonAsync("/roles", new RoleRequest("Night shift", "Out of hours", ["assets.read"]), Ct));
        Assert.Equal("custom", role.Kind);
        var copy = await Read<RoleResponse>(await client.PostAsJsonAsync($"/roles/{role.Id}/copy", new CopyRoleRequest(null), Ct));
        Assert.Equal("Copy of Night shift", copy.Name);
        Assert.Equal(role.Permissions, copy.Permissions);

        var ownerRole = (await Read<List<RoleResponse>>(await client.GetAsync("/roles", Ct))).Single(r => r.Kind == "owner");
        var ownerCopy = await Read<RoleResponse>(await client.PostAsJsonAsync($"/roles/{ownerRole.Id}/copy", new CopyRoleRequest("Deputy"), Ct));
        Assert.Equal("custom", ownerCopy.Kind);
        Assert.Equal(18, ownerCopy.Permissions.Count);

        await api.AddMemberWithRolesAsync(company, [new(copy.Id, [])]);
        Assert.Contains("1 person has this role", await Problem(await client.DeleteAsync($"/roles/{copy.Id}", Ct), HttpStatusCode.Conflict));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/roles/{role.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/roles/{role.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Role_editors_can_not_add_permissions_they_lack()
    {
        var company = await api.CreateCompanyAsync();
        var editor = await Read<RoleResponse>(await api.Client(company.Owner).PostAsJsonAsync("/roles",
            new RoleRequest("Role editor", "", ["roles.manage", "assets.read"]), Ct));
        var (user, _) = await api.AddMemberWithRolesAsync(company, [new(editor.Id, [])]);

        var detail = await Problem(await api.Client(user).PostAsJsonAsync("/roles", new RoleRequest("Mine", "", ["assets.read", "users.manage"]), Ct), HttpStatusCode.Conflict);
        Assert.Contains("You don't have \"Invite and manage users\"", detail);
        await Read<RoleResponse>(await api.Client(user).PostAsJsonAsync("/roles", new RoleRequest("Mine", "", ["assets.read"]), Ct));

        var (tech, _) = await api.AddMemberAsync(company, "technician");
        Assert.Contains("\"Edit roles\"", await Problem(await api.Client(tech).PostAsJsonAsync("/roles", new RoleRequest("X", "", []), Ct), HttpStatusCode.Forbidden));
    }

    [Fact]
    public async Task A_role_saved_from_a_stale_copy_answers_409_instead_of_overwriting()
    {
        var company = await api.CreateCompanyAsync();
        var opened = (await Read<List<RoleResponse>>(await api.Client(company.Owner).GetAsync("/roles", Ct))).Single(r => r.BuiltInKey == "storekeeper");

        var first = await Read<RoleResponse>(await api.Client(company.Owner).PutAsJsonAsync($"/roles/{opened.Id}",
            new RoleRequest(opened.Name, opened.Description, [.. opened.Permissions, "reports.view"], opened.Version), Ct));
        Assert.NotEqual(opened.Version, first.Version);

        var detail = await Problem(await api.Client(company.Owner).PutAsJsonAsync($"/roles/{opened.Id}",
            new RoleRequest(opened.Name, opened.Description, opened.Permissions, opened.Version), Ct), HttpStatusCode.Conflict);
        Assert.Equal("Someone else changed this role since you opened it. Reload to see their changes, then make yours again.", detail);
        Assert.Contains("reports.view", (await Read<RoleResponse>(await api.Client(company.Owner).GetAsync($"/roles/{opened.Id}", Ct))).Permissions);

        var errors = await FieldErrors(await api.Client(company.Owner).PutAsJsonAsync($"/roles/{opened.Id}",
            new RoleRequest(opened.Name, opened.Description, opened.Permissions), Ct));
        Assert.Contains("Send the version", errors["version"][0]);
    }
}
