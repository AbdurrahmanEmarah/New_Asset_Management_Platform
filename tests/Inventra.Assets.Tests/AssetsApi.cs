using Inventra.Contracts.Assets;
using Inventra.Contracts.Catalog;
using Inventra.Contracts.Tenancy;
using Inventra.Testing;

[assembly: AssemblyFixture(typeof(Inventra.Assets.Tests.AssetsApi))]

namespace Inventra.Assets.Tests;

public sealed class AssetsApi : ServiceApi<Program>
{
    protected override string Name => "assets";
    protected override string ConnectionName => "assetsdb";
    protected override Type[] ObservedHandlers => [typeof(ObservedAssetEvents)];

    /// <summary>A client with a plan limit, as Tenancy would announce it.</summary>
    public async Task<Guid> ClientAsync(int maxAssets = 100)
    {
        var id = Guid.NewGuid();
        await DeliverAsync(new ClientCreated(id, "Test Co.", $"t-{id:N}"[..20], "business", 25, "Owner", "owner@example.test", DateTimeOffset.UtcNow, maxAssets, 1024));
        return id;
    }

    /// <summary>A site, as Access would announce it.</summary>
    public async Task<Guid> SiteAsync(Guid clientId, string name = "HQ Tower", bool active = true, Guid? id = null)
    {
        var siteId = id ?? Guid.NewGuid();
        await DeliverAsync(new Contracts.Access.SiteUpdated(clientId, siteId, name, name[..2].ToUpperInvariant(), active, DateTimeOffset.UtcNow));
        return siteId;
    }

    /// <summary>A Pump type, as Catalog would publish it.</summary>
    public async Task<AssetTypePublished> PumpTypeAsync(Guid clientId, int version = 1, IReadOnlyList<FieldDefinition>? fields = null, bool archived = false, Guid? typeId = null)
    {
        var type = new AssetTypePublished(clientId, typeId ?? Guid.NewGuid(), version, "Pump", "PMP", "droplet",
            fields ??
            [
                new("serial_number", "Serial number", FieldKind.Text, true, 0, new FieldRules(MaxLength: 20, Pattern: "[A-Z]{2}-[0-9]{4}", PatternHint: "Use the format AB-1234.")),
                new("flow_rate", "Flow rate", FieldKind.Number, false, 1, new FieldRules(Min: 0, Max: 500, Decimals: 1, Unit: "m³/h")),
                new("duty", "Duty", FieldKind.Choice, false, 2, new FieldRules(Options: ["Duty", "Standby"])),
                new("installed_on", "Installed on", FieldKind.Date, false, 3, new FieldRules(NotInFuture: true)),
                new("feeds", "Feeds", FieldKind.Asset, false, 4, new FieldRules()),
            ],
            [new("in_service", "In service", "ok", 0), new("broken", "Broken", "fault", 1)], archived, DateTimeOffset.UtcNow);
        await DeliverAsync(type);
        return type;
    }
}

/// <summary>Stands in for Tenancy: records the asset counts Assets publishes.</summary>
public static class ObservedAssetEvents
{
    public static void Handle(ClientAssetsCounted m, PublishedEvents e) => e.Add(m);

    public static void Handle(SitesRequested m, PublishedEvents e) => e.Add(m);
}
