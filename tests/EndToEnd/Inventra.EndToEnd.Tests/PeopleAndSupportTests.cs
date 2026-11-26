using System.Text.Json;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>Deactivation, the last-Owner rule, and support passes with their audit.</summary>
public sealed class PeopleAndSupportTests(PlatformStack stack) : AccessTest(stack)
{
    [Fact]
    public async Task Deactivating_someone_locks_them_out_and_the_last_Owner_stays()
    {
        var (company, owner) = await JoinedClientAsync("People");
        var id = Guid.NewGuid().ToString("N")[..8];
        var viewerEmail = $"viewer-{id}@example.com";
        var link = await InviteAsync(owner, "Vera Viewer", viewerEmail, "Viewer / Auditor");
        var viewer = await NewPageAsync();
        await JoinAsync(viewer, link, viewerEmail, "Vera", "Viewer", company);

        // The only Owner can't be deactivated, and the button says why. (Reload: Vera joined in another browser.)
        await owner.ReloadAsync();
        await Expect(PersonRow(owner, "Vera Viewer").GetByRole(AriaRole.Button, new() { Name = "Deactivate Vera Viewer" })).ToBeVisibleAsync();
        var deactivateOwner = PersonRow(owner, "Ola Owner").GetByRole(AriaRole.Button, new() { Name = "Deactivate Ola Owner" });
        await Expect(deactivateOwner).ToHaveAttributeAsync("aria-disabled", "true");
        await Expect(deactivateOwner).ToHaveAccessibleDescriptionAsync(new Regex("Owner"));

        // Deactivating Vera refuses her next request with a plain reason, not a retry.
        await PersonRow(owner, "Vera Viewer").GetByRole(AriaRole.Button, new() { Name = "Deactivate Vera Viewer" }).ClickAsync();
        var confirm = owner.GetByRole(AriaRole.Dialog, new() { Name = "Deactivate Vera Viewer?" });
        await confirm.GetByRole(AriaRole.Button, new() { Name = "Deactivate" }).ClickAsync();
        await Expect(confirm).ToBeHiddenAsync();
        await Expect(PersonRow(owner, "Vera Viewer")).ToContainTextAsync("Deactivated");

        await viewer.ReloadAsync();
        await Expect(viewer.GetByText($"An Admin turned off your access to {company}. Ask them to reactivate it.")).ToBeVisibleAsync();
        await Expect(viewer.GetByRole(AriaRole.Button, new() { Name = "Try again" })).ToHaveCountAsync(0);
    }

    [Fact]
    public async Task A_support_pass_is_read_only_recorded_for_the_client_and_ends_when_they_say()
    {
        var (company, owner) = await JoinedClientAsync("Pass");

        // Support opens a read-only pass from the client list.
        var support = await NewPageAsync();
        await SignInAsync(support, StaffAccount.Support);
        await ClientRow(support, company).GetByRole(AriaRole.Button, new() { Name = $"Request support access to {company}" }).ClickAsync();
        var dialog = support.GetByRole(AriaRole.Dialog, new() { Name = $"Support access to {company}" });
        await dialog.GetByLabel("Reason (shown to the client)").FillAsync("Ticket E2E-42: owner can't see a site.");
        var started = await support.RunAndWaitForResponseAsync(
            () => dialog.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("^Start .* session$") }).ClickAsync(),
            r => r.Request.Method == "POST" && r.Url.Contains("/support", StringComparison.Ordinal) && r.Ok);
        await Expect(support.GetByText("Follow it under Support access.", new() { Exact = false })).ToBeVisibleAsync();
        var pass = await started.JsonAsync() ?? throw new InvalidOperationException("No pass in the response.");
        var header = (pass.GetProperty("headerName").GetString()!, pass.GetProperty("headerValue").GetString()!);

        // With the pass, Support can read the client's people but not change anything.
        Assert.Equal(200, (await ApiAsync(support, "GET", "/users", header: header)).Status);
        Assert.Equal(403, (await ApiAsync(support, "POST", "/sites", new { name = "Sneaky site", code = "SNK", isActive = true }, header)).Status);
        Assert.Equal(403, (await ApiAsync(support, "GET", "/users")).Status);

        // The client's Owner sees the pass with its reason and both recorded actions, and ends it.
        await owner.GetByRole(AriaRole.Link, new() { Name = "Support access" }).ClickAsync();
        var row = owner.GetByRole(AriaRole.Region, new() { Name = "Support passes" }).GetByRole(AriaRole.Row).Filter(new() { HasText = "Ticket E2E-42" });
        await Expect(row).ToContainTextAsync(StaffAccount.Support.Name);
        await Expect(row).ToContainTextAsync("Read-only");
        await Expect(row).ToContainTextAsync("Active");
        await Expect(row.GetByRole(AriaRole.Cell).Nth(4)).ToHaveTextAsync("2");
        await row.GetByRole(AriaRole.Button, new() { Name = $"End {StaffAccount.Support.Name}'s support access" }).ClickAsync();
        await Expect(owner.GetByText($"{StaffAccount.Support.Name}'s support access has ended.")).ToBeVisibleAsync();
        await Expect(row).ToContainTextAsync("Ended");
        await Expect(row).ToContainTextAsync("by Ola Owner");

        // Once ended, the pass opens nothing.
        Assert.Equal(403, (await ApiAsync(support, "GET", "/users", header: header)).Status);
    }
}
