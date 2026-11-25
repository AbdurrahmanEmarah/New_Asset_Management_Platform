namespace Inventra.Access.Identity;

/// <summary>
/// The sign-in provider's user directory (Keycloak locally, Entra External ID in Azure).
/// Access writes two facts there: which client a sign-in belongs to (the tenant_id attribute, which
/// becomes the token's tenant_id claim) and whether the person may sign in at all.
/// </summary>
public interface IIdentityDirectory
{
    /// <summary>Sets the tenant_id attribute. The person's next token carries it.</summary>
    Task LinkToClientAsync(string subject, Guid tenantId, CancellationToken ct);

    /// <summary>Turns sign-in on or off for this person.</summary>
    Task SetSignInEnabledAsync(string subject, bool enabled, CancellationToken ct);
}

/// <summary>The directory refused or couldn't be reached. The message is safe to show.</summary>
public sealed class IdentityDirectoryException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Used when no directory is configured: every call fails with an explanation, never silently.</summary>
internal sealed class UnconfiguredIdentityDirectory : IIdentityDirectory
{
    private const string Why =
        "Sign-in linking isn't set up on this server, so the change couldn't be made. An administrator must set Identity:Keycloak:BaseUrl and its client secret.";

    public Task LinkToClientAsync(string subject, Guid tenantId, CancellationToken ct) => throw new IdentityDirectoryException(Why);

    public Task SetSignInEnabledAsync(string subject, bool enabled, CancellationToken ct) => throw new IdentityDirectoryException(Why);
}
