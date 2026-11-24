using Inventra.Access.Domain;

namespace Inventra.Access.Tests;

public sealed class DomainTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Invitation_tokens_carry_their_client_and_expire_after_seven_days()
    {
        var tenant = Guid.NewGuid();
        var user = AppUser.Invite(tenant, "A@Example.test", "A", [], "Admin", Now);
        var (invitation, token) = Invitation.Create(user, "Admin", Now);
        Assert.Equal(tenant, Invitation.TenantOf(token));
        Assert.Equal(Invitation.Hash(token), invitation.TokenHash);
        Assert.Null(invitation.CannotAcceptReason(Now.AddDays(6), "a@example.test", true, true));
        Assert.Contains("expired", invitation.CannotAcceptReason(Now.AddDays(7), "a@example.test", true, true));
        Assert.Null(Invitation.TenantOf("abc.def"));
    }

    [Fact]
    public void Support_pass_status_follows_time_and_ending()
    {
        var pass = SupportPass.Start(Guid.NewGuid(), "s1", "Sam", "Checking an import", SupportAccess.Read, 30, Now);
        Assert.Equal(SupportPassStatus.Active, pass.StatusAt(Now.AddMinutes(29)));
        Assert.Equal(SupportPassStatus.Expired, pass.StatusAt(Now.AddMinutes(30)));
        Assert.Contains("expired", pass.CannotUseReason("s1", Now.AddHours(1)));
        Assert.Equal(pass.HeaderValue, $"{SupportPass.ParseHeader(pass.HeaderValue)!.Value.TenantId:N}.{pass.Id:N}");
    }

    [Fact]
    public void Client_status_events_apply_in_time_order()
    {
        var client = ClientAccount.Create(Guid.NewGuid(), "Co", "co", "starter", 25, Now);
        Assert.True(client.Suspend("Unpaid", Now.AddMinutes(2)));
        Assert.False(client.Reactivate(Now.AddMinutes(1)));
        Assert.NotNull(client.CannotSignInReason());
        Assert.True(client.ChangePlan("business", 200, Now.AddMinutes(1)));
        Assert.Equal("warn", client.SeatState(160));
        Assert.Contains("all 200 are in use", client.CannotAddSeatReason(200));
    }
}
