using System.Net;
using System.Net.Http.Json;
using Inventra.Access.Api;
using Inventra.Contracts.Access;
using Inventra.Testing;
using static Inventra.Access.Tests.AccessApi;

namespace Inventra.Access.Tests;

public sealed class InvitationTests(AccessApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<(Company Company, InvitationLinkResponse Invite)> InviteAsync(string email, string builtInRole = "technician")
    {
        var company = await api.CreateCompanyAsync();
        var roles = await Read<List<RoleResponse>>(await api.Client(company.Owner).GetAsync("/roles", Ct));
        var role = roles.Single(r => r.BuiltInKey == builtInRole);
        var invite = await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsJsonAsync("/users",
            new InviteUserRequest(email, "Sam Field", [new RoleAssignmentRequest(role.Id, [])]), Ct));
        return (company, invite);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20] + "@example.test";

    [Fact]
    public async Task The_invitee_previews_accepts_and_is_linked_to_the_company()
    {
        var email = Unique("sam");
        var (company, invite) = await InviteAsync(email);
        Assert.StartsWith("https://app.example.test/join#", invite.AcceptUrl);
        Assert.Equal(Domain.UserStatus.Invited, invite.User.Status);

        var signIn = TestUser.Tenant(null, $"sub-{Guid.NewGuid():N}", "Sam Field", email);
        var token = new InvitationTokenRequest(TokenOf(invite.AcceptUrl));
        var preview = await Read<InvitationPreviewResponse>(await api.Client(signIn).PostAsJsonAsync("/invitations/preview", token, Ct));
        Assert.Equal(company.Name, preview.CompanyName);
        Assert.Equal(["Technician"], preview.Roles);
        Assert.Null(preview.CannotAcceptReason);

        var accepted = await Read<AcceptInvitationResponse>(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", token, Ct));
        Assert.True(accepted.SignInAgain);
        Assert.Equal(company.Id, api.Directory.LinkOf(signIn.Id));

        var me = await Read<MeResponse>(await api.Client(signIn with { TenantId = company.Id }).GetAsync("/me", Ct));
        Assert.Equal(email, me.Email);
        Assert.Equal("built_in", Assert.Single(me.Roles).Kind);
        await api.Events.WaitForAsync<ClientUsersCounted>(c => c.ClientId == company.Id && c.Active == 2 && c.Invited == 0);

        // The same link can't be used twice.
        var again = await Problem(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", token, Ct), HttpStatusCode.Conflict);
        Assert.Contains("already been used", again);
    }

    [Fact]
    public async Task Signing_in_with_another_email_is_refused_with_the_right_address()
    {
        var email = Unique("right");
        var (_, invite) = await InviteAsync(email);
        var wrong = TestUser.Tenant(null, "sub-wrong", "Wrong", "wrong@example.test");
        var detail = await Problem(await api.Client(wrong).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(invite.AcceptUrl)), Ct), HttpStatusCode.Conflict);
        Assert.Contains($"This invitation is for {email}", detail);
    }

    [Fact]
    public async Task A_resent_invitation_replaces_the_old_link()
    {
        var email = Unique("resend");
        var (company, invite) = await InviteAsync(email);
        var fresh = await Read<InvitationLinkResponse>(await api.Client(company.Owner).PostAsync($"/users/{invite.User.Id}/invitation", null, Ct));
        Assert.NotEqual(invite.AcceptUrl, fresh.AcceptUrl);

        var signIn = TestUser.Tenant(null, $"sub-{Guid.NewGuid():N}", "Sam", email);
        var old = await Problem(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(invite.AcceptUrl)), Ct), HttpStatusCode.Conflict);
        Assert.Contains("cancelled or replaced", old);
        await Read<AcceptInvitationResponse>(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(fresh.AcceptUrl)), Ct));
    }

    [Fact]
    public async Task Bad_tokens_platform_accounts_and_other_companies_are_refused()
    {
        var email = Unique("edge");
        var (_, invite) = await InviteAsync(email);
        var token = new InvitationTokenRequest(TokenOf(invite.AcceptUrl));

        var errors = await FieldErrors(await api.Client(TestUser.Tenant(null, "x", "X", email)).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest("nonsense"), Ct));
        Assert.Contains("isn't complete", errors["token"][0]);

        var forged = new InvitationTokenRequest(token.Token![..33] + new string('A', 43));
        Assert.Contains("isn't valid", await Problem(await api.Client(TestUser.Tenant(null, "x", "X", email)).PostAsJsonAsync("/invitations/accept", forged, Ct), HttpStatusCode.NotFound));

        Assert.Contains("not an Inventra staff account",
            await Problem(await api.Client(TestUser.PlatformOwner).PostAsJsonAsync("/invitations/accept", token, Ct), HttpStatusCode.Conflict));

        var elsewhere = TestUser.Tenant(Guid.NewGuid(), "sub-elsewhere", "Else", email);
        Assert.Contains("already belongs to another company",
            await Problem(await api.Client(elsewhere).PostAsJsonAsync("/invitations/accept", token, Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task An_unverified_email_must_be_verified_first()
    {
        var email = Unique("unverified");
        var (_, invite) = await InviteAsync(email);
        var signIn = TestUser.Tenant(null, "sub-unverified", "U", email) with { EmailVerified = false };
        Assert.Contains("Verify", await Problem(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", new InvitationTokenRequest(TokenOf(invite.AcceptUrl)), Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task When_the_sign_in_service_is_down_nothing_is_saved()
    {
        var email = Unique("down");
        var (company, invite) = await InviteAsync(email);
        var signIn = TestUser.Tenant(null, $"sub-down-{Guid.NewGuid():N}", "Down", email);
        api.Directory.Failing.Add(signIn.Id);
        var token = new InvitationTokenRequest(TokenOf(invite.AcceptUrl));

        Assert.Contains("couldn't be reached", await Problem(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", token, Ct), HttpStatusCode.ServiceUnavailable));
        var user = await Read<UserResponse>(await api.Client(company.Owner).GetAsync($"/users/{invite.User.Id}", Ct));
        Assert.Equal(Domain.UserStatus.Invited, user.Status);

        api.Directory.Failing.Remove(signIn.Id);
        await Read<AcceptInvitationResponse>(await api.Client(signIn).PostAsJsonAsync("/invitations/accept", token, Ct));
    }
}
