namespace Inventra.Access.Domain;

public enum UserStatus
{
    /// <summary>Invited, hasn't accepted yet. Uses a seat.</summary>
    Invited,
    Active,
    /// <summary>Turned off by an Admin. Can't sign in; doesn't use a seat.</summary>
    Deactivated,
}

public enum ThemePreference
{
    System,
    Light,
    Dark,
}

/// <summary>A person in a client company.</summary>
public sealed class AppUser
{
    public const int NameMax = 120;

    private AppUser() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Lower case. Unique per client.</summary>
    public string Email { get; private set; } = "";
    public string Name { get; private set; } = "";
    public UserStatus Status { get; private set; }

    /// <summary>The identity provider's subject ("sub"), linked when the invitation is accepted.</summary>
    public string? Subject { get; private set; }
    public ThemePreference Theme { get; private set; } = ThemePreference.System;
    public DateTimeOffset InvitedAt { get; private set; }
    public string InvitedByName { get; private set; } = "";
    public DateTimeOffset? JoinedAt { get; private set; }
    public DateTimeOffset? DeactivatedAt { get; private set; }
    public string? DeactivatedByName { get; private set; }

    public List<UserRole> Roles { get; private set; } = [];

    public static AppUser Invite(Guid tenantId, string email, string name, IEnumerable<Role> roles, string invitedByName, DateTimeOffset now)
    {
        var user = new AppUser
        {
            Id = Guid.CreateVersion7(now),
            TenantId = tenantId,
            Email = email.Trim().ToLowerInvariant(),
            Name = name.Trim(),
            Status = UserStatus.Invited,
            InvitedAt = now,
            InvitedByName = invitedByName,
        };
        user.SetRoles(roles);
        return user;
    }

    public bool HasRole(Guid roleId) => Roles.Any(r => r.RoleId == roleId);

    public void SetRoles(IEnumerable<Role> roles)
    {
        var wanted = roles.Select(r => r.Id).Distinct().ToHashSet();
        Roles.RemoveAll(r => !wanted.Contains(r.RoleId));
        foreach (var id in wanted.Where(id => !HasRole(id))) Roles.Add(new UserRole(TenantId, Id, id));
    }

    /// <summary>Why this invitation can't be accepted by this sign-in, or null when it can.</summary>
    public string? CannotJoinReason(string subject)
    {
        if (Status == UserStatus.Active && Subject == subject) return "You've already joined. Sign in again to continue.";
        if (Status == UserStatus.Active) return "Someone has already accepted this invitation.";
        if (Status == UserStatus.Deactivated) return "An Admin turned off this person's access, so the invitation can't be used. Ask them to reactivate it.";
        return null;
    }

    public void Join(string subject, string? nameFromSignIn, DateTimeOffset now)
    {
        if (CannotJoinReason(subject) is { } why) throw new InvalidOperationException(why);
        Subject = subject;
        if (!string.IsNullOrWhiteSpace(nameFromSignIn) && string.IsNullOrWhiteSpace(Name)) Name = nameFromSignIn.Trim();
        Status = UserStatus.Active;
        JoinedAt = now;
    }

    /// <param name="isOwner">This user has the Owner role.</param>
    /// <param name="activeOwners">How many active users have the Owner role, this one included.</param>
    /// <param name="actorIsOwner">The person asking has the Owner role.</param>
    /// <param name="actorUserId">The person asking, or null for a support session.</param>
    public string? CannotDeactivateReason(bool isOwner, int activeOwners, bool actorIsOwner, Guid? actorUserId)
    {
        if (Status == UserStatus.Deactivated) return $"{Name} is already deactivated.";
        if (Status == UserStatus.Invited) return $"{Name} hasn't joined yet. Cancel the invitation instead.";
        if (actorUserId == Id) return "You can't deactivate yourself. Ask another Admin or an Owner.";
        if (isOwner && !actorIsOwner) return $"{Name} is an Owner. Only an Owner can deactivate another Owner.";
        if (isOwner && activeOwners <= 1) return $"{Name} is the only Owner. Make someone else an Owner first.";
        return null;
    }

    public void Deactivate(string byName, DateTimeOffset now)
    {
        Status = UserStatus.Deactivated;
        DeactivatedAt = now;
        DeactivatedByName = byName;
    }

    public string? CannotReactivateReason() => Status == UserStatus.Deactivated ? null : $"{Name} isn't deactivated.";

    /// <summary>A reactivated person goes back to Active if they had joined, otherwise to Invited.</summary>
    public void Reactivate()
    {
        if (CannotReactivateReason() is { } why) throw new InvalidOperationException(why);
        Status = Subject is null ? UserStatus.Invited : UserStatus.Active;
        DeactivatedAt = null;
        DeactivatedByName = null;
    }

    public string? CannotCancelInvitationReason() => Status == UserStatus.Invited ? null : $"{Name} has already joined, so there's no invitation to cancel. Deactivate them instead.";

    public string? CannotResendInvitationReason() => Status == UserStatus.Invited ? null : $"{Name} has already joined, so there's no invitation to send.";

    public void SetTheme(ThemePreference theme) => Theme = theme;
}

/// <summary>One role given to one person.</summary>
public sealed class UserRole(Guid tenantId, Guid userId, Guid roleId)
{
    public Guid TenantId { get; private set; } = tenantId;
    public Guid UserId { get; private set; } = userId;
    public Guid RoleId { get; private set; } = roleId;
}
