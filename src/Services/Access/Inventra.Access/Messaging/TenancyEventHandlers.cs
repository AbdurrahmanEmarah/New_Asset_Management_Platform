using Inventra.Access.Api;
using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Data;
using Inventra.Contracts.Access;
using Inventra.Contracts.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wolverine.EntityFrameworkCore;

namespace Inventra.Access.Messaging;

/// <summary>A Tenancy event arrived for a client Access hasn't set up yet. Wolverine retries it.</summary>
public sealed class ClientNotProvisionedYetException(Guid clientId)
    : Exception($"Client {clientId} isn't set up in Access yet; its ClientCreated event hasn't been handled. The message will be retried.");

/// <summary>
/// Sets up a new client: its account row, the built-in roles and an invitation for its Owner.
/// Safe to receive twice: a client that already exists is left as it is.
/// </summary>
public static class ClientCreatedHandler
{
    public static async Task Handle(
        ClientCreated message, AccessDbContext db, ITenantContext tenant, IDbContextOutbox<AccessDbContext> outbox,
        IOptions<AccessOptions> options, ILogger<ClientCreated> logger, CancellationToken ct)
    {
        await tenant.UseAsync(message.ClientId, ct);
        if (await db.Clients.AnyAsync(ct))
        {
            logger.LogInformation("Client {ClientId} is already set up; ignoring a repeated ClientCreated", message.ClientId);
            return;
        }

        var now = message.OccurredAt;
        var client = ClientAccount.Create(message.ClientId, message.Name, message.Slug, message.PlanKey, message.MaxUsers, now);
        db.Clients.Add(client);

        var roles = BuiltInRoles.All.Select(r => Role.FromBuiltIn(client.TenantId, r, now)).ToList();
        db.Roles.AddRange(roles);

        var owner = AppUser.Invite(client.TenantId, message.OwnerEmail, message.OwnerName, [new RoleAssignment(roles.Single(r => r.IsOwner).Id, [])], "Inventra", now);
        // The token is never logged or stored: the admin console reissues the Owner's link when needed.
        var (invitation, _) = Invitation.Create(owner, "Inventra", now);
        db.Users.Add(owner);
        db.Invitations.Add(invitation);
        db.AuditEntries.Add(AuditEntry.System(client.TenantId, AccessAuditActions.ClientProvisioned,
            $"{client.Name} was set up with the {BuiltInRoles.All.Count} built-in roles. {owner.Email} was invited as Owner.", now));

        await Seats.SaveAndReportAsync(db, outbox, client, now, ct);

        logger.LogInformation("Set up client {ClientId} and created Owner invitation {InvitationId} for {Email}", client.TenantId, invitation.Id, owner.Email);
    }
}

public static class ClientSuspendedHandler
{
    public static async Task Handle(ClientSuspended message, AccessDbContext db, ITenantContext tenant, ILogger<ClientSuspended> logger, CancellationToken ct)
    {
        var client = await TenancyEvents.LoadAsync(message.ClientId, db, tenant, ct);
        if (!client.Suspend(message.Reason, message.OccurredAt))
        {
            logger.LogInformation("Ignored an older suspension for client {ClientId}", message.ClientId);
            return;
        }

        db.AuditEntries.Add(AuditEntry.System(client.TenantId, AccessAuditActions.ClientSuspended,
            $"Inventra suspended the account. Nobody can sign in until it is reactivated. Reason: {message.Reason}", message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }
}

public static class ClientReactivatedHandler
{
    public static async Task Handle(ClientReactivated message, AccessDbContext db, ITenantContext tenant, ILogger<ClientReactivated> logger, CancellationToken ct)
    {
        var client = await TenancyEvents.LoadAsync(message.ClientId, db, tenant, ct);
        if (!client.Reactivate(message.OccurredAt))
        {
            logger.LogInformation("Ignored an older reactivation for client {ClientId}", message.ClientId);
            return;
        }

        db.AuditEntries.Add(AuditEntry.System(client.TenantId, AccessAuditActions.ClientReactivated, "Inventra reactivated the account. Everyone can sign in again.", message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }
}

public static class ClientPlanChangedHandler
{
    public static async Task Handle(ClientPlanChanged message, AccessDbContext db, ITenantContext tenant, ILogger<ClientPlanChanged> logger, CancellationToken ct)
    {
        var client = await TenancyEvents.LoadAsync(message.ClientId, db, tenant, ct);
        var before = client.MaxUsers;
        if (!client.ChangePlan(message.PlanKey, message.MaxUsers, message.OccurredAt))
        {
            logger.LogInformation("Ignored an older plan change for client {ClientId}", message.ClientId);
            return;
        }

        db.AuditEntries.Add(AuditEntry.System(client.TenantId, AccessAuditActions.PlanChanged,
            $"Plan changed to {message.PlanKey}. User limit {before} → {message.MaxUsers}.", message.OccurredAt));
        await db.SaveChangesAsync(ct);
    }
}

internal static class TenancyEvents
{
    public static async Task<ClientAccount> LoadAsync(Guid clientId, AccessDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        await tenant.UseAsync(clientId, ct);
        return await db.Clients.SingleOrDefaultAsync(ct) ?? throw new ClientNotProvisionedYetException(clientId);
    }
}
