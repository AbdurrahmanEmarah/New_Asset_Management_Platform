using System.Text.Json;
using System.Text.Json.Nodes;

namespace Inventra.Access.Tests;

/// <summary>
/// docs/contracts/access.openapi.json is what the Web and Mobile apps build against. This test fails
/// when the API changes without that file. To refresh it, run the tests with INVENTRA_UPDATE_CONTRACTS=1.
/// </summary>
public sealed class ContractTests(AccessApi api)
{
    [Fact]
    public async Task The_published_OpenAPI_document_matches_the_service()
    {
        var live = await api.Client(null).GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        var formatted = Format(live);
        var path = Path.Combine(RepositoryRoot(), "docs", "contracts", "access.openapi.json");

        if (Environment.GetEnvironmentVariable("INVENTRA_UPDATE_CONTRACTS") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, formatted, TestContext.Current.CancellationToken);
            return;
        }

        Assert.True(File.Exists(path), $"{path} is missing. Run the tests with INVENTRA_UPDATE_CONTRACTS=1 to create it.");
        var published = Format(await File.ReadAllTextAsync(path, TestContext.Current.CancellationToken));
        Assert.True(published == formatted,
            "The Access API changed but docs/contracts/access.openapi.json didn't. Run the tests with INVENTRA_UPDATE_CONTRACTS=1 and commit the file.");
    }

    private static string Format(string json)
    {
        var node = JsonNode.Parse(json)!;
        node.AsObject().Remove("servers"); // the test server's address isn't part of the contract
        return node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }).ReplaceLineEndings("\n") + "\n";
    }

    private static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Inventra.slnx"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("Couldn't find the repository root (Inventra.slnx).");
    }
}
