using System.Text.Json;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>Helpers for flows in the client web app (realm "inventra") and the Access service.</summary>
public abstract class AccessTest(PlatformStack stack) : BrowserTest(stack)
{
    protected const string Password = "Inventra-e2e-1";

    private bool _staffSignedIn;

    /// <summary>The answer to an API call made from a page with its signed-in person's token.</summary>
    protected sealed record ApiResult(int Status, JsonElement Body)
    {
        public string Detail => Body.ValueKind == JsonValueKind.Object && Body.TryGetProperty("detail", out var d) ? d.GetString() ?? "" : "";
    }

    /// <summary>
    /// Calls an API through the gateway from the page (a path like "/users" means Access; "/api/assets/..." any service), with the person's own token (and a support
    /// pass header when given), exactly as the app does.
    /// </summary>
    protected async Task<ApiResult> ApiAsync(IPage page, string method, string path, object? body = null, (string Name, string Value)? header = null)
    {
        var result = await page.EvaluateAsync<JsonElement>(
            """
            async ([url, method, headerName, headerValue, body]) => {
              const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
              const token = JSON.parse(sessionStorage.getItem(key)).access_token;
              const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
              if (headerName) headers[headerName] = headerValue;
              const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
              const text = await r.text();
              let json = null;
              try { json = text ? JSON.parse(text) : null; } catch { json = text; }
              return { status: r.status, body: json };
            }
            """,
            new object?[] { Stack.GatewayUrl + (path.StartsWith("/api/", StringComparison.Ordinal) ? path : "/api/access" + path), method, header?.Name, header?.Value, body });
        return new ApiResult(result.GetProperty("status").GetInt32(), result.GetProperty("body"));
    }

    /// <summary>A new client whose Owner has joined: the Platform Owner is signed in on <see cref="BrowserTest.Page"/>.</summary>
    protected async Task<(string Company, IPage Owner)> JoinedClientAsync(string prefix)
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var (company, slug) = UniqueClient(prefix);
        var ownerEmail = $"owner-{id}@example.com";
        if (!_staffSignedIn)
        {
            await SignInAsync(StaffAccount.Owner);
            _staffSignedIn = true;
        }
        else
        {
            await Page.GetByRole(AriaRole.Link, new() { Name = "Clients" }).ClickAsync();
        }
        await CreateClientAsync(Page, company, slug, ownerEmail: ownerEmail);
        var owner = await NewPageAsync();
        await JoinAsync(owner, await NewOwnerLinkAsync(company), ownerEmail, "Ola", "Owner", company);
        await Expect(owner.GetByRole(AriaRole.Heading, new() { Name = "Assets", Level = 1 })).ToBeVisibleAsync();
        return (company, owner);
    }

    /// <summary>The Owner invites someone through the Users page and returns their link.</summary>
    protected static async Task<string> InviteAsync(IPage owner, string name, string email, string role, string? site = null)
    {
        await GoToSettingsAsync(owner, "users", "Users");
        await owner.GetByRole(AriaRole.Button, new() { Name = "Invite people" }).ClickAsync();
        var invite = owner.GetByRole(AriaRole.Dialog, new() { Name = "Invite people" });
        // Wait for the roles to load before typing: until Web fixes it, the Dialog moves focus back to its
        // first field whenever the page re-renders (reported bug), and the roles arriving is that re-render.
        var roleBox = invite.GetByRole(AriaRole.Checkbox, new() { Name = role });
        await Expect(roleBox).ToBeVisibleAsync();
        var nameBox = invite.GetByRole(AriaRole.Textbox, new() { Name = "Name" });
        var emailBox = invite.GetByRole(AriaRole.Textbox, new() { Name = "Email" });
        await nameBox.FillAsync(name);
        await emailBox.FillAsync(email);
        await Expect(nameBox).ToHaveValueAsync(name);
        await Expect(emailBox).ToHaveValueAsync(email);
        await roleBox.CheckAsync();
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

    /// <summary>Opens a Settings page by its address (the app's home is Assets; Settings has its own side menu).</summary>
    protected static async Task GoToSettingsAsync(IPage page, string path, string heading)
    {
        await page.GotoAsync(new Uri(page.Url).GetLeftPart(UriPartial.Authority) + "/settings/" + path);
        await Expect(page.GetByRole(AriaRole.Heading, new() { Name = heading, Level = 1 })).ToBeVisibleAsync();
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
