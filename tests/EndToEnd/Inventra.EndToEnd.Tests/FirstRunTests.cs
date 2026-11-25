namespace Inventra.EndToEnd.Tests;

/// <summary>Runs first (see <see cref="FirstRunFirst"/>), on the empty platform.</summary>
public sealed class FirstRunTests(PlatformStack stack) : BrowserTest(stack)
{
    [Fact]
    public async Task Owner_signs_in_through_Keycloak_and_sees_the_empty_state()
    {
        await Page.GotoAsync("/");
        await Expect(Page.GetByText("Sign in with your platform staff account.")).ToBeVisibleAsync();

        await SignInAsync(StaffAccount.Owner);

        // No "Code not valid" from a second redemption under StrictMode.
        await Expect(Page.GetByText("Sign-in didn't finish")).ToHaveCountAsync(0);
        await Expect(Page.GetByText("Platform Owner").First).ToBeVisibleAsync();

        var list = Page.GetByRole(AriaRole.Region, new() { Name = "Client list" });
        await Expect(list.GetByText("No clients yet")).ToBeVisibleAsync();
        await Expect(list.GetByText("Create the first client to give a company its own workspace.")).ToBeVisibleAsync();

        await OpenAuditLogAsync(Page);
        await Expect(Page.GetByText("Nothing recorded yet")).ToBeVisibleAsync();
    }
}
