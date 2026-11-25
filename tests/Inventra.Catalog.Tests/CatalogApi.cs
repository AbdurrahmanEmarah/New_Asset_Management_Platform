using Inventra.Contracts.Catalog;
using Inventra.Testing;

[assembly: AssemblyFixture(typeof(Inventra.Catalog.Tests.CatalogApi))]

namespace Inventra.Catalog.Tests;

public sealed class CatalogApi : ServiceApi<Program>
{
    protected override string Name => "catalog";
    protected override string ConnectionName => "catalogdb";
    protected override Type[] ObservedHandlers => [typeof(ObservedCatalogEvents)];
}

/// <summary>Stands in for Assets: records the type definitions Catalog publishes.</summary>
public static class ObservedCatalogEvents
{
    public static void Handle(AssetTypePublished m, PublishedEvents e) => e.Add(m);
}
