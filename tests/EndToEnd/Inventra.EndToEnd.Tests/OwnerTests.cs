namespace Inventra.EndToEnd.Tests;

/// <summary>The Platform Owner's flows from patch 01. Each test makes its own client.</summary>
public sealed class OwnerTests(PlatformStack stack) : BrowserTest(stack)
{
    public override async ValueTask InitializeAsync()
    {
        await base.InitializeAsync();
        await SignInAsync(StaffAccount.Owner);
    }

    [Fact]
    public async Task Creates_a_client()
    {
        var (name, slug) = UniqueClient("Create");

        await CreateClientAsync(Page, name, slug, plan: "Starter");

        var row = ClientRow(Page, name);
        await Expect(row).ToContainTextAsync(slug);
        await Expect(row).ToContainTextAsync("ola@example.com");
        await Expect(row).ToContainTextAsync("Starter");
        await Expect(row).ToContainTextAsync("Active");
    }

    [Fact]
    public async Task A_duplicate_sub_domain_shows_its_field_error()
    {
        var (name, slug) = UniqueClient("Dup");
        await CreateClientAsync(Page, name, slug);

        await Page.GetByRole(AriaRole.Button, new() { Name = "New client" }).ClickAsync();
        var dialog = Page.GetByRole(AriaRole.Dialog, new() { Name = "New client" });
        await FillNewClientAsync(dialog, name + " again", slug);
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Create client" }).ClickAsync();

        // The server's message, shown on the field, and the dialog stays open to fix it.
        var subDomain = dialog.GetByLabel("Sub-domain");
        await Expect(subDomain).ToHaveAttributeAsync("aria-invalid", "true");
        await Expect(subDomain).ToHaveAccessibleDescriptionAsync(new System.Text.RegularExpressions.Regex(
            $"\"{slug}\" is already used by another client\\. Choose another sub-domain\\."));
        await Expect(dialog).ToBeVisibleAsync();

        await dialog.GetByRole(AriaRole.Button, new() { Name = "Cancel" }).ClickAsync();
        await Expect(ClientRow(Page, name + " again")).ToHaveCountAsync(0);
    }

    [Fact]
    public async Task Suspend_needs_a_reason_and_reactivate_restores_the_client()
    {
        var (name, slug) = UniqueClient("Suspend");
        await CreateClientAsync(Page, name, slug, plan: "Business");
        var row = ClientRow(Page, name);

        await row.GetByRole(AriaRole.Button, new() { Name = $"Suspend {name}" }).ClickAsync();
        var dialog = Page.GetByRole(AriaRole.Dialog, new() { Name = $"Suspend {name}?" });
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Suspend client" }).ClickAsync();
        await Expect(dialog.GetByText("Say why the client is suspended. Their owner will see this.")).ToBeVisibleAsync();
        await Expect(dialog.GetByLabel("Reason (shown to the client's owner)")).ToHaveAttributeAsync("aria-invalid", "true");

        await dialog.GetByLabel("Reason (shown to the client's owner)").FillAsync("Invoice INV-104 unpaid for 60 days.");
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Suspend client" }).ClickAsync();
        await Expect(dialog).ToBeHiddenAsync();
        await Expect(Page.GetByText($"{name} is suspended.")).ToBeVisibleAsync();
        await Expect(row).ToContainTextAsync("Suspended");

        await row.GetByRole(AriaRole.Button, new() { Name = $"Reactivate {name}" }).ClickAsync();
        await Expect(Page.GetByText($"{name} is active again.")).ToBeVisibleAsync();
        await Expect(row).ToContainTextAsync("Active");
        await Expect(row.GetByRole(AriaRole.Button, new() { Name = $"Suspend {name}" })).ToBeVisibleAsync();
    }

    [Fact]
    public async Task Changes_a_clients_plan()
    {
        var (name, slug) = UniqueClient("Plan");
        await CreateClientAsync(Page, name, slug);

        await ChangePlanAsync(Page, name, "Business");

        await Expect(ClientRow(Page, name)).ToContainTextAsync("Business");
    }

    [Fact]
    public async Task The_audit_log_shows_each_action()
    {
        var (name, slug) = UniqueClient("Audit");
        await CreateClientAsync(Page, name, slug);
        var row = ClientRow(Page, name);

        await row.GetByRole(AriaRole.Button, new() { Name = $"Suspend {name}" }).ClickAsync();
        var dialog = Page.GetByRole(AriaRole.Dialog, new() { Name = $"Suspend {name}?" });
        await dialog.GetByLabel("Reason (shown to the client's owner)").FillAsync("Audit trail check.");
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Suspend client" }).ClickAsync();
        await Expect(Page.GetByText($"{name} is suspended.")).ToBeVisibleAsync();
        await row.GetByRole(AriaRole.Button, new() { Name = $"Reactivate {name}" }).ClickAsync();
        await Expect(Page.GetByText($"{name} is active again.")).ToBeVisibleAsync();
        await ChangePlanAsync(Page, name, "Enterprise");

        await OpenAuditLogAsync(Page);
        var entries = ClientRow(Page, name);
        await Expect(entries).ToHaveCountAsync(4);
        // Newest first.
        await Expect(entries.Nth(0)).ToContainTextAsync("Changed plan");
        await Expect(entries.Nth(1)).ToContainTextAsync("Reactivated client");
        await Expect(entries.Nth(2)).ToContainTextAsync("Suspended client");
        await Expect(entries.Nth(2)).ToContainTextAsync("Reason: Audit trail check.");
        await Expect(entries.Nth(3)).ToContainTextAsync("Created client");
        await Expect(entries.Nth(3)).ToContainTextAsync("Created on the Trial plan");
        for (var i = 0; i < 4; i++) await Expect(entries.Nth(i)).ToContainTextAsync(StaffAccount.Owner.Name);
    }

    internal static async Task ChangePlanAsync(IPage page, string clientName, string plan)
    {
        await ClientRow(page, clientName).GetByRole(AriaRole.Button, new() { Name = $"Change plan for {clientName}" }).ClickAsync();
        var dialog = page.GetByRole(AriaRole.Dialog, new() { Name = $"Change plan for {clientName}" });
        await dialog.GetByRole(AriaRole.Radio, new() { Name = plan }).CheckAsync();
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Change plan" }).ClickAsync();
        await Expect(dialog).ToBeHiddenAsync();
        await Expect(page.GetByText($"{clientName} is now on the {plan} plan.")).ToBeVisibleAsync();
    }
}
