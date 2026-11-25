using Xunit.Sdk;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>The platform staff accounts imported with the inventra-platform realm.</summary>
public sealed record StaffAccount(string Email, string Name, string RoleLabel)
{
    public const string Password = "Inventra-dev-1";

    public static StaffAccount Owner { get; } = new("owner@inventra.local", "Platform Owner", "Platform Owner");
    public static StaffAccount Support { get; } = new("support@inventra.local", "Support Agent", "Support");
    public static StaffAccount Billing { get; } = new("billing@inventra.local", "Billing Clerk", "Billing");
}

/// <summary>
/// Gives each test its own browser context (cookies, storage, Keycloak session), records a trace, and
/// keeps a screenshot and the trace only when the test fails.
/// </summary>
public abstract class BrowserTest(PlatformStack stack) : IAsyncLifetime
{
    protected const string OwnerOnly = "Only the Platform Owner can do this.";
    protected const string BillingOnly = "Only the Platform Owner or Billing can change plans.";

    private readonly List<IBrowserContext> _contexts = [];

    protected PlatformStack Stack { get; } = stack;
    protected IPage Page { get; private set; } = null!;

    public virtual async ValueTask InitializeAsync()
    {
        // The first load of the Vite dev server compiles on demand, and Keycloak can be slow on a
        // small runner. Generous limits here, not retries: a real failure still fails.
        Assertions.SetDefaultExpectTimeout(15_000);
        Page = await NewPageAsync();
    }

    /// <summary>A new, isolated browser context: use one per signed-in person.</summary>
    protected async Task<IPage> NewPageAsync(ViewportSize? viewport = null)
    {
        var context = await Stack.Browser.NewContextAsync(new()
        {
            BaseURL = Stack.AdminUrl,
            ViewportSize = viewport ?? new ViewportSize { Width = 1280, Height = 800 },
            ColorScheme = ColorScheme.Light,
            Locale = "en-GB",
        });
        context.SetDefaultTimeout(15_000);
        context.SetDefaultNavigationTimeout(30_000);
        await context.Tracing.StartAsync(new() { Screenshots = true, Snapshots = true, Sources = false, Title = TestName });
        _contexts.Add(context);
        var page = await context.NewPageAsync();
        // Shown in the test's output, so a failure's report includes what the browser complained about.
        page.Console += (_, m) => { if (m.Type is "error" or "warning") TestContext.Current.SendDiagnosticMessage($"[browser {m.Type}] {m.Text}"); };
        page.PageError += (_, e) => TestContext.Current.SendDiagnosticMessage($"[page error] {e}");
        return page;
    }

    private static string TestName =>
        TestContext.Current.Test is { } t ? $"{t.TestCase.TestClassSimpleName()}.{t.TestCase.TestMethodName}" : "test";

    public async ValueTask DisposeAsync()
    {
        var failed = TestContext.Current.TestState?.Result is TestResult.Failed;
        var safeName = Regex.Replace(TestName, "[^A-Za-z0-9_.-]", "_");
        if (failed) Stack.SaveStackLog();
        for (var i = 0; i < _contexts.Count; i++)
        {
            var context = _contexts[i];
            var suffix = _contexts.Count > 1 ? $"-{i + 1}" : "";
            if (failed)
            {
                Directory.CreateDirectory(PlatformStack.ArtifactsDir);
                foreach (var page in context.Pages)
                {
                    await page.ScreenshotAsync(new() { Path = Path.Combine(PlatformStack.ArtifactsDir, $"{safeName}{suffix}.png"), FullPage = true });
                }
                await context.Tracing.StopAsync(new() { Path = Path.Combine(PlatformStack.ArtifactsDir, $"{safeName}{suffix}.trace.zip") });
            }
            else
            {
                await context.Tracing.StopAsync();
            }
            await context.CloseAsync();
        }
        GC.SuppressFinalize(this);
    }

    /// <summary>Signs in through the Keycloak login page and waits for the console.</summary>
    protected static async Task SignInAsync(IPage page, StaffAccount who)
    {
        await page.GotoAsync("/");
        await page.GetByRole(AriaRole.Button, new() { Name = "Sign in" }).ClickAsync();

        // Keycloak's own login page.
        await page.Locator("#username").FillAsync(who.Email);
        await page.Locator("#password").FillAsync(StaffAccount.Password);
        await page.Locator("#kc-login").ClickAsync();

        // Back on the console, with the code redeemed once (StrictMode runs the effect twice).
        await Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Clients", Level = 1 })).ToBeVisibleAsync(new() { Timeout = 30_000 });
        await Expect(page.GetByRole(AriaRole.Navigation, new() { Name = "Platform admin" })).ToContainTextAsync(who.RoleLabel);
    }

    protected Task SignInAsync(StaffAccount who) => SignInAsync(Page, who);

    /// <summary>A client name and sub-domain that no other test (or earlier run) uses.</summary>
    protected static (string Name, string Slug) UniqueClient(string prefix)
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        return ($"{prefix} {id}", $"{prefix.ToLowerInvariant().Replace(' ', '-')}-{id}");
    }

    /// <summary>Creates a client through the New client dialog and waits for its row.</summary>
    protected static async Task CreateClientAsync(IPage page, string name, string slug, string plan = "Trial", string ownerEmail = "ola@example.com")
    {
        await page.GetByRole(AriaRole.Button, new() { Name = "New client" }).ClickAsync();
        var dialog = page.GetByRole(AriaRole.Dialog, new() { Name = "New client" });
        await FillNewClientAsync(dialog, name, slug, plan, ownerEmail);
        await dialog.GetByRole(AriaRole.Button, new() { Name = "Create client" }).ClickAsync();

        await Expect(dialog).ToBeHiddenAsync();
        await Expect(page.GetByText($"{name} was created on the {plan} plan.")).ToBeVisibleAsync();
        await Expect(ClientRow(page, name)).ToBeVisibleAsync();
    }

    protected static async Task FillNewClientAsync(ILocator dialog, string name, string slug, string plan = "Trial", string ownerEmail = "ola@example.com")
    {
        await dialog.GetByLabel("Company name").FillAsync(name);
        await dialog.GetByLabel("Sub-domain").FillAsync(slug);
        var region = dialog.GetByLabel("Data region");
        // Regions load with the dialog; wait for a real option before choosing the first one.
        await Expect(region.Locator("option").Nth(1)).ToBeAttachedAsync();
        await region.SelectOptionAsync(new SelectOptionValue { Index = 1 });
        var planSelect = dialog.GetByRole(AriaRole.Combobox, new() { Name = "Plan", Exact = true });
        await Expect(planSelect.Locator("option", new() { HasText = plan })).ToBeAttachedAsync();
        await planSelect.SelectOptionAsync(new SelectOptionValue { Label = plan });
        await dialog.GetByLabel("Owner's name").FillAsync("Ola Owner");
        await dialog.GetByLabel("Owner's email").FillAsync(ownerEmail);
    }

    protected static ILocator ClientRow(IPage page, string name) =>
        page.GetByRole(AriaRole.Row).Filter(new() { Has = page.GetByText(name, new() { Exact = true }) });

    protected static async Task OpenAuditLogAsync(IPage page)
    {
        await page.GetByRole(AriaRole.Link, new() { Name = "Audit log" }).ClickAsync();
        await Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Audit log", Level = 1 })).ToBeVisibleAsync();
    }

    /// <summary>The page is no wider than the window, so nothing scrolls sideways.</summary>
    protected static async Task ExpectNoHorizontalScrollAsync(IPage page, string where)
    {
        var size = await page.EvaluateAsync<int[]>(
            "() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]");
        var (scroll, client) = (size[0], size[1]);
        Assert.True(scroll <= client, $"{where}: the page is {scroll}px wide in a {client}px window, so it scrolls sideways.");
    }
}

internal static class TestCaseExtensions
{
    public static string TestClassSimpleName(this ITestCase testCase) =>
        testCase.TestClassName?.Split('.').Last() ?? "Test";
}
