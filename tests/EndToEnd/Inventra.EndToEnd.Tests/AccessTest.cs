using System.Text.Json;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>Helpers for flows in the client web app (realm "inventra") and the Access service.</summary>
public abstract class AccessTest(PlatformStack stack) : BrowserTest(stack)
{
    protected const string Password = "Inventra-e2e-1";

    /// <summary>A new client whose Owner has joined: the Platform Owner is signed in on <see cref="BrowserTest.Page"/>.</summary>
    protected async Task<(string Company, IPage Owner)> JoinedClientAsync(string prefix)
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var (company, slug) = UniqueClient(prefix);
        var ownerEmail = $"owner-{id}@example.com";
        await SignInAsync(StaffAccount.Owner);
        await CreateClientAsync(Page, company, slug, ownerEmail: ownerEmail);
        var owner = await NewPageAsync();
        await JoinAsync(owner, await NewOwnerLinkAsync(company), ownerEmail, "Ola", "Owner", company);
        await Expect(owner.GetByRole(AriaRole.Heading, new() { Name = "Users", Level = 1 })).ToBeVisibleAsync();
        return (company, owner);
    }

    /// <summary>The Owner invites someone through the Users page and returns their link.</summary>
    protected static async Task<string> InviteAsync(IPage owner, string name, string email, string role, string? site = null)
    {
        await owner.GetByRole(AriaRole.Link, new() { Name = "Users" }).ClickAsync();
        await owner.GetByRole(AriaRole.Button, new() { Name = "Invite people" }).ClickAsync();
        var invite = owner.GetByRole(AriaRole.Dialog, new() { Name = "Invite people" });
        await invite.GetByRole(AriaRole.Textbox, new() { Name = "Name" }).FillAsync(name);
        await invite.GetByRole(AriaRole.Textbox, new() { Name = "Email" }).FillAsync(email);
        await invite.GetByRole(AriaRole.Checkbox, new() { Name = role }).CheckAsync();
        if (site is not null)
        {
            await invite.GetByRole(AriaRole.Group, new() { Name = "Sites these roles apply at" }).GetByRole(AriaRole.Button, new() { Name = site }).ClickAsync();
            await Expect(invite.GetByText("Their roles apply only at these sites.")).ToBeVisibleAsync();
        }
        await invite.GetByRole(AriaRole.Button, new() { Name = "Create invitation" }).ClickAsync();

        var linkDialog = owner.GetByRole(AriaRole.Dialog, new() { Name = $"Send {name} their invitation" });
        var link = await linkDialog.GetByRole(AriaRole.Textbox, new() { Name = "Invitation link" }).InputValueAsync();
        await linkDialog.GetByRole(AriaRole.Button, new() { Name = "Done" }).ClickAsync();
        await Expect(owner.GetByText($"{name} is invited. Send them the link.")).ToBeVisibleAsync();
        return link;
    }

    protected static ILocator PersonRow(IPage owner, string name) =>
        owner.GetByRole(AriaRole.Region, new() { Name = "People" }).GetByRole(AriaRole.Row).Filter(new() { HasText = name });

    protected async Task<string> NewOwnerLinkAsync(string company)
    {
        await ClientRow(Page, company).GetByRole(AriaRole.Button, new() { Name = $"Owner invitation for {company}" }).ClickAsync();
        var dialog = Page.GetByRole(AriaRole.Dialog, new() { Name = $"{company}: Owner invitation" });
        var makeLink = dialog.GetByRole(AriaRole.Button, new() { Name = "Make a new link" });
        var tryAgain = dialog.GetByRole(AriaRole.Button, new() { Name = "Try again" });

        // Access sets the client up from Tenancy's ClientCreated event (outbox → RabbitMQ), a few seconds
        // after the console says "created". Until then the dialog says so and offers "Try again", as a person would use it.
        var deadline = DateTime.UtcNow.AddSeconds(20);
        await Expect(makeLink.Or(tryAgain)).ToBeVisibleAsync();
        while (await tryAgain.IsVisibleAsync() && DateTime.UtcNow < deadline)
        {
            await Expect(dialog.GetByText("Access hasn't set up this client yet.", new() { Exact = false })).ToBeVisibleAsync();
            await Page.WaitForTimeoutAsync(1000);
            await tryAgain.ClickAsync();
            await Expect(makeLink.Or(tryAgain)).ToBeVisibleAsync();
        }
        await makeLink.ClickAsync();
        var link = await dialog.GetByRole(AriaRole.Textbox, new() { Name = "Invitation link (shown once)" }).InputValueAsync();
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Close" }).ClickAsync();
        return link;
    }

    /// <summary>Opens an invitation link, creates the account in the client realm, joins, and returns the person's /me.</summary>
    protected static async Task<JsonElement> JoinAsync(IPage page, string link, string email, string first, string last, string company)
    {
        await page.GotoAsync(link);
        await Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Join your company on Inventra" })).ToBeVisibleAsync();
        await page.GetByRole(AriaRole.Button, new() { Name = "Sign in" }).ClickAsync();

        // Keycloak, realm "inventra": no account yet, so register one with the invited email.
        await page.GetByRole(AriaRole.Link, new() { Name = "Register" }).ClickAsync();
        await page.Locator("#email").FillAsync(email);
        await page.Locator("#password").FillAsync(Password);
        await page.Locator("#password-confirm").FillAsync(Password);
        await page.Locator("#firstName").FillAsync(first);
        await page.Locator("#lastName").FillAsync(last);
        await page.GetByRole(AriaRole.Button, new() { Name = "Register" }).ClickAsync();

        // Back on /join, signed in: the preview names the company.
        var join = page.GetByRole(AriaRole.Button, new() { Name = $"Join {company}" });
        await Expect(join).ToBeVisibleAsync(new() { Timeout = 30_000 });

        // Joining signs in again (the new token carries the company), then loads the workspace.
        var response = await page.RunAndWaitForResponseAsync(
            () => join.ClickAsync(),
            r => r.Url.EndsWith("/api/access/me", StringComparison.Ordinal) && r.Status == 200,
            new() { Timeout = 30_000 });
        return await response.JsonAsync() ?? throw new InvalidOperationException("/me returned no body.");
    }

    protected static async Task SuspendAsync(IPage page, string company, string reason)
    {
        await page.GetByRole(AriaRole.Link, new() { Name = "Clients" }).ClickAsync();
        await ClientRow(page, company).GetByRole(AriaRole.Button, new() { Name = $"Suspend {company}" }).ClickAsync();
        var dialog = page.GetByRole(AriaRole.Dialog, new() { Name = $"Suspend {company}?" });
        await dialog.GetByLabel("Reason (shown to the client's owner)").FillAsync(reason);
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Suspend client" }).ClickAsync();
        await Expect(page.GetByText($"{company} is suspended.")).ToBeVisibleAsync();
    }

    /// <summary>
    /// Tenancy tells Access about the suspension with an event (outbox → RabbitMQ), so it lands a moment
    /// after the admin console says "suspended". Reload like a person would, for up to 20 seconds.
    /// </summary>
    protected static async Task ExpectRefusedAfterReloadAsync(IPage page, string message)
    {
        var refusal = page.GetByText(message);
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            await page.ReloadAsync();
            await Expect(page.GetByText("Loading your workspace…")).ToHaveCountAsync(0);
            if (await refusal.CountAsync() > 0 || DateTime.UtcNow > deadline) break;
            await page.WaitForTimeoutAsync(1000);
        }
        await Expect(refusal).ToBeVisibleAsync(new() { Timeout = 1 });
        await Expect(page.GetByRole(AriaRole.Button, new() { Name = "Try again" })).ToHaveCountAsync(0);
    }
}
