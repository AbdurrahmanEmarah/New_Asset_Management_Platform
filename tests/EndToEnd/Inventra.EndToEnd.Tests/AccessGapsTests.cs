using System.Text.Json;

namespace Inventra.EndToEnd.Tests;

/// <summary>Milestone 02 cases that weren't automated with the first Access suite.</summary>
public sealed class AccessGapsTests(PlatformStack stack) : AccessTest(stack)
{
    [Fact]
    public async Task Two_clients_never_see_each_others_people_roles_sites_or_audit()
    {
        var (companyA, ownerA) = await JoinedClientAsync("Iso A");
        var (companyB, ownerB) = await JoinedClientAsync("Iso B");

        var siteB = await ApiAsync(ownerB, "POST", "/sites", new { name = $"{companyB} yard", code = "BYD", isActive = true });
        Assert.Equal(201, siteB.Status);
        var siteBId = siteB.Body.GetProperty("id").GetString();
        var meB = (await ApiAsync(ownerB, "GET", "/me")).Body;
        var ownerBId = meB.GetProperty("userId").GetString();
        var ownerBEmail = meB.GetProperty("email").GetString()!;
        var rolesB = Ids((await ApiAsync(ownerB, "GET", "/roles")).Body);

        // Lists as A: nothing of B's, by id or by name.
        var usersA = await ApiAsync(ownerA, "GET", "/users");
        Assert.Equal(200, usersA.Status);
        Assert.DoesNotContain(ownerBEmail, usersA.Body.GetRawText(), StringComparison.OrdinalIgnoreCase);
        var rolesA = Ids((await ApiAsync(ownerA, "GET", "/roles")).Body);
        Assert.Empty(rolesA.Intersect(rolesB));
        Assert.DoesNotContain(companyB, (await ApiAsync(ownerA, "GET", "/sites")).Body.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain(companyB, (await ApiAsync(ownerA, "GET", "/audit")).Body.GetRawText(), StringComparison.Ordinal);

        // B's things by id, as A: "not found", so A can't even learn they exist.
        Assert.Equal(404, (await ApiAsync(ownerA, "GET", $"/users/{ownerBId}")).Status);
        Assert.Equal(404, (await ApiAsync(ownerA, "GET", $"/roles/{rolesB.First()}")).Status);
        Assert.Equal(404, (await ApiAsync(ownerA, "PUT", $"/sites/{siteBId}", new { name = "Taken over", code = "TKO", isActive = true })).Status);
        Assert.Equal(404, (await ApiAsync(ownerA, "POST", $"/users/{ownerBId}/deactivate")).Status);

        // And in the app: A's people list shows only A's Owner.
        await GoToSettingsAsync(ownerA, "users", "Users");
        var people = ownerA.GetByRole(AriaRole.Region, new() { Name = "People" });
        await Expect(people.GetByText("Ola Owner")).ToHaveCountAsync(1);
        await Expect(people.GetByText(ownerBEmail)).ToHaveCountAsync(0);
        await Expect(ownerA.GetByText(companyA).First).ToBeVisibleAsync();
    }

    [Fact]
    public async Task Reactivating_a_suspended_client_lets_its_people_back_in()
    {
        var (company, owner) = await JoinedClientAsync("React");
        await SuspendAsync(Page, company, "Checking reactivation.");
        await ExpectRefusedAfterReloadAsync(owner, $"{company}'s Inventra account is suspended (Checking reactivation.). Your company's Owner can contact Inventra to restore it.");

        await ClientRow(Page, company).GetByRole(AriaRole.Button, new() { Name = $"Reactivate {company}" }).ClickAsync();
        await Expect(Page.GetByText($"{company} is active again.")).ToBeVisibleAsync();

        // ClientReactivated reaches Access by event: reload like a person would, for up to 20 seconds.
        var users = owner.GetByRole(AriaRole.Heading, new() { Name = "Assets", Level = 1 });
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            await owner.ReloadAsync();
            await Expect(owner.GetByText("Loading your workspace…")).ToHaveCountAsync(0);
            if (await users.CountAsync() > 0 || DateTime.UtcNow > deadline) break;
            await owner.WaitForTimeoutAsync(1000);
        }
        await Expect(users).ToBeVisibleAsync(new() { Timeout = 1 });
        Assert.Equal(200, (await ApiAsync(owner, "GET", "/me")).Status);
    }

    [Fact]
    public async Task The_seat_limit_blocks_the_eleventh_seat_with_its_sentence()
    {
        var (_, owner) = await JoinedClientAsync("Seats");
        var technician = RoleId((await ApiAsync(owner, "GET", "/roles")).Body, "Technician");
        var id = Guid.NewGuid().ToString("N")[..6];

        // Trial plan: 10 seats. The Owner holds one; nine invitations fill the rest.
        string? lastInvited = null;
        for (var i = 1; i <= 9; i++)
        {
            var invited = await ApiAsync(owner, "POST", "/users", Invite($"seat{i}-{id}@example.com", $"Seat {i}", technician));
            Assert.True(invited.Status == 201, $"Invitation {i} answered {invited.Status}: {invited.Detail}");
            lastInvited = invited.Body.GetProperty("user").GetProperty("id").GetString();
        }
        var summary = (await ApiAsync(owner, "GET", "/users/summary")).Body;
        Assert.Equal(10, summary.GetProperty("seats").GetInt32());
        Assert.Equal("blocked", summary.GetProperty("state").GetString());

        var refused = await ApiAsync(owner, "POST", "/users", Invite($"seat10-{id}@example.com", "Seat 10", technician));
        Assert.Equal(409, refused.Status);
        Assert.Equal("Your plan allows 10 users and all 10 are in use (active users and open invitations). Deactivate someone or cancel an invitation, or ask your Owner about a bigger plan.", refused.Detail);

        // The app says exactly the same before anyone tries.
        await GoToSettingsAsync(owner, "users", "Users");
        var inviteButton = owner.GetByRole(AriaRole.Button, new() { Name = "Invite people" });
        await Expect(inviteButton).ToHaveAttributeAsync("aria-disabled", "true");
        await Expect(inviteButton).ToHaveAccessibleDescriptionAsync("Your plan allows 10 users and all 10 are in use (active users and open invitations). Deactivate someone or cancel an invitation, or ask your Owner about a bigger plan.");

        // Cancelling an invitation frees its seat.
        Assert.Equal(204, (await ApiAsync(owner, "DELETE", $"/users/{lastInvited}/invitation")).Status);
        Assert.Equal(201, (await ApiAsync(owner, "POST", "/users", Invite($"seat10-{id}@example.com", "Seat 10", technician))).Status);
    }

    [Fact]
    public async Task A_new_invitation_link_replaces_the_old_one_and_cancelling_stops_both()
    {
        var (_, owner) = await JoinedClientAsync("Links");
        var id = Guid.NewGuid().ToString("N")[..6];
        var first = await InviteAsync(owner, "Rita Resend", $"rita-{id}@example.com", "Technician");

        await PersonRow(owner, "Rita Resend").GetByRole(AriaRole.Button, new() { Name = "New invitation link for Rita Resend" }).ClickAsync();
        var dialog = owner.GetByRole(AriaRole.Dialog, new() { Name = "Send Rita Resend their invitation" });
        var second = await dialog.GetByRole(AriaRole.Textbox, new() { Name = "Invitation link" }).InputValueAsync();
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Done" }).ClickAsync();
        Assert.NotEqual(first, second);

        // A replaced link still opens, but says why it can't be used, so the Join button is disabled with that reason.
        const string replaced = "This invitation was cancelled or replaced by a newer one. Ask your company's Admin to send you a new invitation.";
        Assert.Equal(replaced, await CannotAcceptAsync(owner, first));
        // (The Owner previews it, so any reason given is about them already being a member, not about the link.)
        Assert.NotEqual(replaced, await CannotAcceptAsync(owner, second));

        await PersonRow(owner, "Rita Resend").GetByRole(AriaRole.Button, new() { Name = "Cancel invitation for Rita Resend" }).ClickAsync();
        var confirm = owner.GetByRole(AriaRole.Dialog, new() { Name = "Cancel Rita Resend's invitation?" });
        await confirm.GetByRole(AriaRole.Button, new() { Name = "Cancel invitation" }).ClickAsync();
        await Expect(PersonRow(owner, "Rita Resend")).ToHaveCountAsync(0);

        // Cancelling removes the invitation, so its link no longer opens at all, and can't be accepted.
        const string invalid = "This invitation link isn't valid. Ask your company's Admin to send you a new invitation.";
        var preview = await ApiAsync(owner, "POST", "/invitations/preview", new { token = Token(second) });
        Assert.Equal(404, preview.Status);
        Assert.Equal(invalid, preview.Detail);
        var accept = await ApiAsync(owner, "POST", "/invitations/accept", new { token = Token(second) });
        Assert.Equal(404, accept.Status);
        Assert.Equal(invalid, accept.Detail);
    }

    private async Task<string?> CannotAcceptAsync(IPage page, string link)
    {
        var preview = await ApiAsync(page, "POST", "/invitations/preview", new { token = Token(link) });
        Assert.True(preview.Status == 200, $"Preview answered {preview.Status}: {preview.Body}");
        return preview.Body.GetProperty("cannotAcceptReason").GetString();
    }

    private static string Token(string link) => link[(link.IndexOf('#') + 1)..];

    private static object Invite(string email, string name, string roleId) =>
        new { email, name, roles = new[] { new { roleId, siteIds = Array.Empty<string>() } } };

    private static List<string> Ids(JsonElement list) => list.EnumerateArray().Select(r => r.GetProperty("id").GetString()!).ToList();

    private static string RoleId(JsonElement roles, string name) =>
        roles.EnumerateArray().First(r => r.GetProperty("name").GetString() == name).GetProperty("id").GetString()!;
}
