using System.Text.Json;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>
/// Milestone 02's main flow across both apps and both realms: platform staff create a client and hand
/// its Owner a link; the Owner creates an account in the "inventra" realm and joins; the Owner adds a
/// site and invites a Technician limited to it; the Technician joins with that scope; platform staff
/// suspend the client, and its people see why.
/// </summary>
public sealed class AccessJourneyTests(PlatformStack stack) : AccessTest(stack)
{
    [Fact]
    public async Task Owner_joins_invites_a_Technician_at_one_site_and_suspension_locks_them_out()
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var (company, slug) = UniqueClient("Journey");
        var ownerEmail = $"owner-{id}@example.com";
        var techEmail = $"tech-{id}@example.com";
        var siteName = $"North Depot {id}";

        // 1. Platform Owner creates the client and makes a fresh Owner link.
        await SignInAsync(StaffAccount.Owner);
        await CreateClientAsync(Page, company, slug, ownerEmail: ownerEmail);
        var ownerLink = await NewOwnerLinkAsync(company);
        Assert.StartsWith(Stack.ClientUrl + "/join#", ownerLink);

        // 2. The Owner opens the link, creates their account and joins.
        var owner = await NewPageAsync();
        await JoinAsync(owner, ownerLink, ownerEmail, "Ola", "Owner", company);
        await Expect(owner.GetByRole(AriaRole.Heading, new() { Name = "Users", Level = 1 })).ToBeVisibleAsync();
        await Expect(owner.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("^Account: Ola Owner, .*Owner") })).ToBeVisibleAsync();

        // 3. The Owner adds a site and invites a Technician limited to it.
        await owner.GetByRole(AriaRole.Link, new() { Name = "Sites" }).ClickAsync();
        await owner.GetByRole(AriaRole.Button, new() { Name = "New site" }).ClickAsync();
        var siteDialog = owner.GetByRole(AriaRole.Dialog);
        await siteDialog.GetByRole(AriaRole.Textbox, new() { Name = "Name" }).FillAsync(siteName);
        await siteDialog.GetByRole(AriaRole.Textbox, new() { Name = "Code" }).FillAsync("N" + id[..4].ToUpperInvariant());
        await siteDialog.GetByRole(AriaRole.Button, new() { Name = "Add site" }).ClickAsync();
        await Expect(siteDialog).ToBeHiddenAsync();
        await Expect(owner.GetByRole(AriaRole.Region, new() { Name = "Sites" }).GetByText(siteName)).ToBeVisibleAsync();

        var techLink = await InviteAsync(owner, "Tariq Tech", techEmail, "Technician", siteName);
        Assert.StartsWith(Stack.ClientUrl + "/join#", techLink);
        await Expect(PersonRow(owner, "Tariq Tech")).ToContainTextAsync($"Technician · {siteName}");

        // 4. The Technician joins; their own /me carries the one-site scope.
        var tech = await NewPageAsync();
        var me = await JoinAsync(tech, techLink, techEmail, "Tariq", "Tech", company);
        var techRole = Assert.Single(me.GetProperty("roles").EnumerateArray());
        Assert.Equal("Technician", techRole.GetProperty("name").GetString());
        Assert.False(techRole.GetProperty("allSites").GetBoolean());
        Assert.Single(techRole.GetProperty("siteIds").EnumerateArray());
        Assert.False(me.GetProperty("isOwner").GetBoolean());
        await Expect(tech.GetByRole(AriaRole.Button, new() { Name = "Account: Tariq Tech, Technician" })).ToBeVisibleAsync();

        // 5. Platform staff suspend the client; its people see the reason on their next request.
        await SuspendAsync(Page, company, "Invoice E2E-7 unpaid.");
        var expected = $"{company}'s Inventra account is suspended (Invoice E2E-7 unpaid.). Your company's Owner can contact Inventra to restore it.";
        await ExpectRefusedAfterReloadAsync(tech, expected);
        await ExpectRefusedAfterReloadAsync(owner, expected);
    }
}
