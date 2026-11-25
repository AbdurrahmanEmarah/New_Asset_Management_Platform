using Xunit.Sdk;
using Xunit.v3;

[assembly: TestCollectionOrderer(typeof(Inventra.EndToEnd.Tests.FirstRunFirst))]

namespace Inventra.EndToEnd.Tests;

/// <summary>
/// Runs <see cref="FirstRunTests"/> before everything else, because the empty state is only visible
/// before any other test creates a client. Every other test is independent and makes its own data.
/// </summary>
public sealed class FirstRunFirst : ITestCollectionOrderer
{
    public IReadOnlyCollection<TTestCollection> OrderTestCollections<TTestCollection>(IReadOnlyCollection<TTestCollection> testCollections)
        where TTestCollection : notnull, ITestCollection =>
        testCollections
            .OrderBy(c => c.TestCollectionDisplayName.Contains(nameof(FirstRunTests), StringComparison.Ordinal) ? 0 : 1)
            .ThenBy(c => c.TestCollectionDisplayName, StringComparer.Ordinal)
            .ToList();
}
