using System.Text.Json.Nodes;
using Inventra.AssetModel;
using Inventra.Contracts.Catalog;

namespace Inventra.BuildingBlocks.Tests;

public sealed class AssetValueTests
{
    private static readonly DateOnly Today = new(2026, 11, 25);

    [Fact]
    public void Values_are_normalised_to_the_types_current_fields()
    {
        FieldDefinition[] fields =
        [
            new("power", "Power", FieldKind.Number, false, 0, new FieldRules(Decimals: 0)),
            new("tags", "Tags", FieldKind.Choice, false, 1, new FieldRules(Options: ["Red", "Blue"], Multiple: true)),
            new("owner", "Owner", FieldKind.Person, false, 2, new FieldRules()),
            new("since", "Since", FieldKind.Date, false, 3, new FieldRules()),
        ];
        var person = Guid.NewGuid();
        var errors = new RuleErrors();
        var check = AssetValues.Check(fields, new JsonObject { ["power"] = "12", ["tags"] = new JsonArray("red", "BLUE", "red"), ["owner"] = person.ToString(), ["since"] = " 2026-01-31 " }, Today, errors);
        Assert.False(errors.Any);
        Assert.Equal(12m, check.Values["power"]!.GetValue<decimal>());
        Assert.Equal(["Red", "Blue"], check.Values["tags"]!.AsArray().Select(n => n!.GetValue<string>()).ToArray());
        Assert.Equal("2026-01-31", check.Values["since"]!.GetValue<string>());

        AssetValues.Check(fields, new JsonObject { ["power"] = 1.5, ["owner"] = "someone", ["since"] = "31/01/2026" }, Today, errors);
        var e = errors.ToDictionary();
        Assert.Equal("Use a whole number.", e["values.power"][0]);
        Assert.Contains("a person from your company", e["values.owner"][0]);
        Assert.Contains("YYYY-MM-DD", e["values.since"][0]);
    }

    [Fact]
    public void Keys_are_made_from_labels()
    {
        Assert.Equal("serial_no", AssetTypeRules.KeyFromLabel("Serial No."));
        Assert.Equal("f_2nd_meter", AssetTypeRules.KeyFromLabel("2nd meter"));
        Assert.Null(AssetTypeRules.KeyProblem("flow_rate"));
        Assert.NotNull(AssetTypeRules.KeyProblem("Flow Rate"));
    }
}
