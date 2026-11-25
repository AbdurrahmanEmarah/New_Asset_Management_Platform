using Inventra.Contracts.Shared;
using Inventra.Contracts.Tenancy;
using Inventra.Tenancy.Data;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Inventra.Tenancy.Messaging;

/// <summary>Backfill: tells a service that started after a client was created what that client's plan allows.</summary>
public static class ClientLimitsRequestedHandler
{
    public static async Task Handle(ClientLimitsRequested message, TenancyDbContext db, IMessageBus bus, ILogger<ClientLimitsRequested> logger, CancellationToken ct)
    {
        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.Id == message.ClientId, ct);
        if (client is null)
        {
            logger.LogWarning("{Service} asked for the limits of client {ClientId}, which Tenancy doesn't know", message.Service, message.ClientId);
            return;
        }

        var plan = await db.Plans.AsNoTracking().FirstAsync(p => p.Key == client.PlanKey, ct);
        await bus.PublishAsync(new ClientLimitsAnnounced(client.Id, plan.Key, plan.MaxUsers, plan.MaxAssets, plan.StorageGb * 1024L, message.RequestedAt));
    }
}
