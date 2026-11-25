namespace Inventra.EndToEnd.Tests;

/// <summary>Theme and small screens.</summary>
public sealed class LayoutTests(PlatformStack stack) : BrowserTest(stack)
{
    [Fact]
    public async Task The_theme_choice_survives_a_reload()
    {
        await SignInAsync(StaffAccount.Owner);
        var html = Page.Locator("html");
        // The context prefers light, and "System" follows it.
        await Expect(html).ToHaveAttributeAsync("data-theme", "light");

        var appearance = Page.GetByRole(AriaRole.Navigation, new() { Name = "Platform admin" }).GetByRole(AriaRole.Radiogroup, new() { Name = "Appearance" });
        await appearance.GetByRole(AriaRole.Radio, new() { Name = "Dark" }).ClickAsync();
        await Expect(html).ToHaveAttributeAsync("data-theme", "dark");

        await Page.ReloadAsync();
        await Expect(Page.GetByRole(AriaRole.Heading, new() { Name = "Clients", Level = 1 })).ToBeVisibleAsync();
        await Expect(html).ToHaveAttributeAsync("data-theme", "dark");
        await Expect(appearance.GetByRole(AriaRole.Radio, new() { Name = "Dark" })).ToHaveAttributeAsync("aria-checked", "true");

        // The no-flash script in index.html sets the theme before React runs.
        var themeBeforeReact = await Page.EvaluateAsync<string>(
            "async () => { const r = await fetch('/'); const html = await r.text(); return html.includes(\"localStorage.getItem('inventra.theme')\") ? 'script' : 'missing'; }");
        Assert.Equal("script", themeBeforeReact);
    }

    [Fact]
    public async Task Nothing_scrolls_sideways_at_phone_width()
    {
        var phone = await NewPageAsync(new ViewportSize { Width = 390, Height = 844 });

        await phone.GotoAsync("/");
        await Expect(phone.GetByRole(AriaRole.Button, new() { Name = "Sign in" })).ToBeVisibleAsync();
        await ExpectNoHorizontalScrollAsync(phone, "Sign-in page");

        await SignInAsync(phone, StaffAccount.Owner);
        var (name, slug) = UniqueClient("Phone");
        await CreateClientAsync(phone, name, slug);
        await ExpectNoHorizontalScrollAsync(phone, "Clients page with a client");

        await phone.GetByRole(AriaRole.Button, new() { Name = "New client" }).ClickAsync();
        await Expect(phone.GetByRole(AriaRole.Dialog, new() { Name = "New client" })).ToBeVisibleAsync();
        await ExpectNoHorizontalScrollAsync(phone, "New client dialog");
        await phone.Keyboard.PressAsync("Escape");

        await OpenAuditLogAsync(phone);
        await Expect(ClientRow(phone, name)).ToBeVisibleAsync();
        await ExpectNoHorizontalScrollAsync(phone, "Audit log");
    }
}
