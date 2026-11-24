namespace Inventra.EndToEnd.Tests;

/// <summary>Support and Billing see the console, and the buttons they can't use say why.</summary>
public sealed class RoleTests(PlatformStack stack) : BrowserTest(stack)
{
    /// <summary>The Owner makes a client in their own browser context, so the role has a row to look at.</summary>
    private async Task<string> ClientMadeByOwnerAsync(string prefix)
    {
        var owner = await NewPageAsync();
        await SignInAsync(owner, StaffAccount.Owner);
        var (name, slug) = UniqueClient(prefix);
        await CreateClientAsync(owner, name, slug);
        await owner.CloseAsync();
        return name;
    }

    private static async Task ExpectRefusedAsync(ILocator button, string reason)
    {
        await Expect(button).ToBeVisibleAsync();
        await Expect(button).ToHaveAttributeAsync("aria-disabled", "true");
        await Expect(button).ToHaveAccessibleDescriptionAsync(reason);
        await Expect(button).ToHaveAttributeAsync("title", reason);
    }

    [Fact]
    public async Task Support_is_read_only_and_each_button_says_why()
    {
        var name = await ClientMadeByOwnerAsync("Support");

        await SignInAsync(StaffAccount.Support);
        var row = ClientRow(Page, name);
        await Expect(row).ToBeVisibleAsync();

        var newClient = Page.GetByRole(AriaRole.Button, new() { Name = "New client" });
        await ExpectRefusedAsync(newClient, OwnerOnly);
        await ExpectRefusedAsync(row.GetByRole(AriaRole.Button, new() { Name = $"Suspend {name}" }), OwnerOnly);
        await ExpectRefusedAsync(row.GetByRole(AriaRole.Button, new() { Name = $"Change plan for {name}" }), BillingOnly);

        // Clicking a refused button opens nothing. Force: Playwright itself won't click an aria-disabled button.
        await newClient.ClickAsync(new() { Force = true });
        await row.GetByRole(AriaRole.Button, new() { Name = $"Change plan for {name}" }).ClickAsync(new() { Force = true });
        await Expect(Page.GetByRole(AriaRole.Dialog)).ToHaveCountAsync(0);

        // Support can still read the audit log.
        await OpenAuditLogAsync(Page);
        await Expect(ClientRow(Page, name)).ToContainTextAsync("Created client");
    }

    [Fact]
    public async Task Billing_can_change_plans_only()
    {
        var name = await ClientMadeByOwnerAsync("Billing");

        await SignInAsync(StaffAccount.Billing);
        var row = ClientRow(Page, name);
        await Expect(row).ToBeVisibleAsync();

        await ExpectRefusedAsync(Page.GetByRole(AriaRole.Button, new() { Name = "New client" }), OwnerOnly);
        await ExpectRefusedAsync(row.GetByRole(AriaRole.Button, new() { Name = $"Suspend {name}" }), OwnerOnly);
        await Expect(row.GetByRole(AriaRole.Button, new() { Name = $"Change plan for {name}" })).Not.ToHaveAttributeAsync("aria-disabled", "true");

        await OwnerTests.ChangePlanAsync(Page, name, "Starter");
        await Expect(row).ToContainTextAsync("Starter");

        await OpenAuditLogAsync(Page);
        var latest = ClientRow(Page, name).First;
        await Expect(latest).ToContainTextAsync("Changed plan");
        await Expect(latest).ToContainTextAsync(StaffAccount.Billing.Name);
    }
}
