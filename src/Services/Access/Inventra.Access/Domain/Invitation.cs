using System.Security.Cryptography;
using System.Text;

namespace Inventra.Access.Domain;

public enum InvitationStatus
{
    Pending,
    Accepted,
    /// <summary>Cancelled by an Admin, or replaced by a newer invitation.</summary>
    Cancelled,
}

/// <summary>
/// An invitation link for one person. Only a hash of the token is stored. The token starts with the
/// client's id, so the service can look it up inside that client's rows without seeing other clients.
/// </summary>
public sealed class Invitation
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    private Invitation() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid UserId { get; private set; }
    public string Email { get; private set; } = "";
    public string TokenHash { get; private set; } = "";
    public InvitationStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public string CreatedByName { get; private set; } = "";
    public DateTimeOffset? AcceptedAt { get; private set; }

    /// <returns>The invitation and its token. The token is shown once and can't be recovered.</returns>
    public static (Invitation Invitation, string Token) Create(AppUser user, string createdByName, DateTimeOffset now)
    {
        var token = $"{user.TenantId:N}.{Base64Url(RandomNumberGenerator.GetBytes(32))}";
        var invitation = new Invitation
        {
            Id = Guid.CreateVersion7(now),
            TenantId = user.TenantId,
            UserId = user.Id,
            Email = user.Email,
            TokenHash = Hash(token),
            Status = InvitationStatus.Pending,
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
            CreatedByName = createdByName,
        };
        return (invitation, token);
    }

    /// <summary>The client id at the start of a token, or null when the token isn't one of ours.</summary>
    public static Guid? TenantOf(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var dot = token.IndexOf('.', StringComparison.Ordinal);
        return dot == 32 && Guid.TryParseExact(token[..dot], "N", out var id) && token.Length > 40 ? id : null;
    }

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim())));

    /// <summary>Why this sign-in can't accept the invitation, or null when it can.</summary>
    public string? CannotAcceptReason(DateTimeOffset now, string? signInEmail, bool emailVerified, bool requireVerifiedEmail)
    {
        if (Status == InvitationStatus.Accepted) return "This invitation has already been used. Sign in to continue.";
        if (Status == InvitationStatus.Cancelled) return "This invitation was cancelled or replaced by a newer one. Ask your company's Admin to send you a new invitation.";
        if (now >= ExpiresAt) return $"This invitation expired on {ExpiresAt:d MMM yyyy}. Ask your company's Admin to send you a new one.";
        if (!string.Equals(signInEmail?.Trim(), Email, StringComparison.OrdinalIgnoreCase))
            return $"This invitation is for {Email}, but you're signed in as {signInEmail ?? "an account without an email"}. Sign out and sign in with {Email}.";
        if (requireVerifiedEmail && !emailVerified) return $"Verify {Email} first: open the verification email from Inventra, then try again.";
        return null;
    }

    public void Accept(DateTimeOffset now)
    {
        Status = InvitationStatus.Accepted;
        AcceptedAt = now;
    }

    public void Cancel() => Status = InvitationStatus.Cancelled;

    public bool IsOpen(DateTimeOffset now) => Status == InvitationStatus.Pending && now < ExpiresAt;

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
