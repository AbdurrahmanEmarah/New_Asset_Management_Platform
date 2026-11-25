using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Inventra.Contracts.Catalog;

namespace Inventra.AssetModel;

/// <summary>Field errors keyed like the API's validation problems, e.g. "fields[2].rules" or "values.serial_no".</summary>
public sealed class RuleErrors
{
    private readonly Dictionary<string, List<string>> _errors = new(StringComparer.Ordinal);

    public bool Any => _errors.Count > 0;

    public RuleErrors Add(string field, string message)
    {
        if (!_errors.TryGetValue(field, out var list)) _errors[field] = list = [];
        list.Add(message);
        return this;
    }

    public IDictionary<string, string[]> ToDictionary() => _errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
}

/// <summary>Checks an asset type's definition: its fields, their rules and its statuses.</summary>
public static partial class AssetTypeRules
{
    public const int MaxFields = 60;
    public const int MaxStatuses = 20;
    public const int LabelMax = 80;
    public const int TextMax = 4000;
    public static readonly string[] Meanings = ["ok", "warn", "fault", "info", "none"];

    [GeneratedRegex("^[a-z][a-z0-9_]{0,39}$")]
    private static partial Regex KeyPattern();

    /// <summary>The problem with a field or status key, or null. Keys are lower case: letters, digits and underscores.</summary>
    public static string? KeyProblem(string? key) =>
        string.IsNullOrWhiteSpace(key) ? "Key is required."
        : KeyPattern().IsMatch(key) ? null
        : "Use lower-case letters, numbers and underscores, starting with a letter (up to 40), e.g. serial_no.";

    /// <summary>A key made from a label: "Serial No." → "serial_no".</summary>
    public static string KeyFromLabel(string label)
    {
        var key = Regex.Replace(label.Trim().ToLowerInvariant(), "[^a-z0-9]+", "_").Trim('_');
        if (key.Length == 0 || !char.IsAsciiLetterLower(key[0])) key = "f_" + key;
        return key.Length > 40 ? key[..40].TrimEnd('_') : key;
    }

    public static void CheckFields(IReadOnlyList<FieldDefinition> fields, RuleErrors errors, string prefix = "fields")
    {
        if (fields.Count > MaxFields) errors.Add(prefix, $"Use {MaxFields} fields or fewer.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < fields.Count; i++)
        {
            var f = fields[i];
            var at = $"{prefix}[{i}]";
            if (KeyProblem(f.Key) is { } keyProblem) errors.Add($"{at}.key", keyProblem);
            else if (!seen.Add(f.Key)) errors.Add($"{at}.key", $"Another field already uses the key \"{f.Key}\". Each field needs its own key.");
            if (string.IsNullOrWhiteSpace(f.Label)) errors.Add($"{at}.label", "Label is required.");
            else if (f.Label.Trim().Length > LabelMax) errors.Add($"{at}.label", $"Use {LabelMax} characters or fewer.");
            if (!Enum.IsDefined(f.Kind)) errors.Add($"{at}.kind", "Choose a kind: text, number, date, choice, person, asset or file.");
            CheckRules(f.Kind, f.Rules ?? new FieldRules(), errors, $"{at}.rules");
        }
    }

    private static void CheckRules(FieldKind kind, FieldRules r, RuleErrors errors, string at)
    {
        switch (kind)
        {
            case FieldKind.Text:
                if (r.MinLength is < 0 || r.MaxLength is < 1 or > TextMax)
                    errors.Add(at, $"Lengths must be between 0 and {TextMax} characters.");
                else if (r.MinLength > r.MaxLength) errors.Add(at, "The shortest length can't be more than the longest.");
                if (r.Pattern is { Length: > 0 } pattern)
                {
                    try
                    {
                        _ = new Regex(pattern, RegexOptions.None, TimeSpan.FromMilliseconds(100));
                    }
                    catch (ArgumentException)
                    {
                        errors.Add(at, "The pattern isn't a valid regular expression.");
                    }

                    if (string.IsNullOrWhiteSpace(r.PatternHint))
                        errors.Add(at, "Add a hint for the pattern, e.g. \"Use the format AB-1234\", so people know what to type.");
                }

                break;
            case FieldKind.Number:
                if (r.Min > r.Max) errors.Add(at, "The lowest value can't be more than the highest.");
                if (r.Decimals is < 0 or > 6) errors.Add(at, "Decimal places must be between 0 and 6.");
                if (r.Unit?.Trim().Length > 16) errors.Add(at, "Use a short unit (16 characters or fewer), e.g. kW or hours.");
                break;
            case FieldKind.Choice:
                var options = r.Options ?? [];
                if (options.Count == 0) errors.Add(at, "Add at least one option to choose from.");
                else if (options.Count > 100) errors.Add(at, "Use 100 options or fewer.");
                if (options.Any(string.IsNullOrWhiteSpace)) errors.Add(at, "Options can't be empty.");
                else if (options.Any(o => o.Trim().Length > LabelMax)) errors.Add(at, $"Keep each option to {LabelMax} characters or fewer.");
                if (options.Select(o => o.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != options.Count)
                    errors.Add(at, "Each option must be different.");
                break;
        }
    }

    public static void CheckStatuses(IReadOnlyList<StatusDefinition> statuses, RuleErrors errors, string prefix = "statuses")
    {
        if (statuses.Count == 0) errors.Add(prefix, "Add at least one status, e.g. In service.");
        if (statuses.Count > MaxStatuses) errors.Add(prefix, $"Use {MaxStatuses} statuses or fewer.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < statuses.Count; i++)
        {
            var s = statuses[i];
            var at = $"{prefix}[{i}]";
            if (KeyProblem(s.Key) is { } keyProblem) errors.Add($"{at}.key", keyProblem);
            else if (!seen.Add(s.Key)) errors.Add($"{at}.key", $"Another status already uses the key \"{s.Key}\".");
            if (string.IsNullOrWhiteSpace(s.Label)) errors.Add($"{at}.label", "Label is required.");
            else if (s.Label.Trim().Length > LabelMax) errors.Add($"{at}.label", $"Use {LabelMax} characters or fewer.");
            if (!Meanings.Contains(s.Meaning)) errors.Add($"{at}.meaning", "Choose what the status means: ok, warn, fault, info or none.");
        }
    }
}

/// <summary>The result of checking an asset's values against its type.</summary>
/// <param name="Values">The values to store: only the type's current fields, normalised.</param>
/// <param name="LinkedAssets">Asset ids referenced by "asset" fields; the caller checks they exist.</param>
public sealed record ValueCheck(JsonObject Values, IReadOnlyList<(string Key, Guid AssetId)> LinkedAssets);

/// <summary>Checks an asset's field values against its type's current fields.</summary>
public static class AssetValues
{
    public static ValueCheck Check(IReadOnlyList<FieldDefinition> fields, JsonObject? input, DateOnly today, RuleErrors errors, string prefix = "values")
    {
        input ??= [];
        var output = new JsonObject();
        var links = new List<(string, Guid)>();
        var byKey = fields.ToDictionary(f => f.Key, StringComparer.Ordinal);

        foreach (var (key, _) in input)
        {
            if (!byKey.ContainsKey(key)) errors.Add($"{prefix}.{key}", $"This asset type has no field \"{key}\". Reload the form and try again.");
        }

        foreach (var f in fields.OrderBy(f => f.Order))
        {
            var at = $"{prefix}.{f.Key}";
            input.TryGetPropertyValue(f.Key, out var node);
            if (IsEmpty(node))
            {
                if (f.Required) errors.Add(at, $"{f.Label} is required.");
                continue;
            }

            var r = f.Rules ?? new FieldRules();
            var value = f.Kind switch
            {
                FieldKind.Text => Text(f, r, node!, errors, at),
                FieldKind.Number => Number(f, r, node!, errors, at),
                FieldKind.Date => Date(f, r, node!, today, errors, at),
                FieldKind.Choice => Choice(f, r, node!, errors, at),
                FieldKind.Person or FieldKind.File => Id(f, node!, errors, at),
                FieldKind.Asset => Id(f, node!, errors, at),
                _ => null,
            };

            if (value is null) continue;
            if (f.Kind == FieldKind.Asset) links.Add((f.Key, Guid.Parse(value.GetValue<string>())));
            output[f.Key] = value;
        }

        return new ValueCheck(output, links);
    }

    private static bool IsEmpty(JsonNode? node) =>
        node is null
        || (node is JsonValue v && v.TryGetValue<string>(out var s) && string.IsNullOrWhiteSpace(s))
        || (node is JsonArray a && a.Count == 0);

    private static JsonNode? Text(FieldDefinition f, FieldRules r, JsonNode node, RuleErrors errors, string at)
    {
        if (node is not JsonValue v || !v.TryGetValue<string>(out var s)) return Fail(errors, at, $"{f.Label} must be text.");
        s = s.Trim();
        var max = r.MaxLength ?? AssetTypeRules.TextMax;
        if (s.Length > max) return Fail(errors, at, $"Use {max} characters or fewer.");
        if (r.MinLength is { } min && s.Length < min) return Fail(errors, at, $"Use at least {min} characters.");
        if (r.Pattern is { Length: > 0 } pattern)
        {
            bool matches;
            try
            {
                matches = Regex.IsMatch(s, $"^(?:{pattern})$", RegexOptions.None, TimeSpan.FromMilliseconds(100));
            }
            catch (RegexMatchTimeoutException)
            {
                matches = false;
            }

            if (!matches) return Fail(errors, at, r.PatternHint ?? "This doesn't match the expected format.");
        }

        return JsonValue.Create(s);
    }

    private static JsonNode? Number(FieldDefinition f, FieldRules r, JsonNode node, RuleErrors errors, string at)
    {
        decimal number;
        if (node is JsonValue v && v.GetValueKind() == JsonValueKind.Number
            && decimal.TryParse(v.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) number = d;
        else if (node is JsonValue sv && sv.TryGetValue<string>(out var text)
                 && decimal.TryParse(text.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)) number = parsed;
        else return Fail(errors, at, $"{f.Label} must be a number, e.g. 12.5.");

        var unit = string.IsNullOrWhiteSpace(r.Unit) ? "" : $" {r.Unit.Trim()}";
        if (r.Min is { } min && number < min) return Fail(errors, at, $"Use {min.ToString(CultureInfo.InvariantCulture)}{unit} or more.");
        if (r.Max is { } max && number > max) return Fail(errors, at, $"Use {max.ToString(CultureInfo.InvariantCulture)}{unit} or less.");
        if (r.Decimals is { } decimals && decimal.Round(number, decimals) != number)
            return Fail(errors, at, decimals == 0 ? "Use a whole number." : $"Use at most {decimals} decimal places.");
        return JsonValue.Create(number);
    }

    private static JsonNode? Date(FieldDefinition f, FieldRules r, JsonNode node, DateOnly today, RuleErrors errors, string at)
    {
        if (node is not JsonValue v || !v.TryGetValue<string>(out var s)
            || !DateOnly.TryParseExact(s.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return Fail(errors, at, $"{f.Label} must be a date written as YYYY-MM-DD, e.g. 2026-03-31.");
        if (r.NotInFuture && date > today) return Fail(errors, at, $"{f.Label} can't be in the future.");
        return JsonValue.Create(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }

    private static JsonNode? Choice(FieldDefinition f, FieldRules r, JsonNode node, RuleErrors errors, string at)
    {
        var options = r.Options ?? [];
        string? Match(JsonNode? n) =>
            n is JsonValue v && v.TryGetValue<string>(out var s) ? options.FirstOrDefault(o => string.Equals(o.Trim(), s.Trim(), StringComparison.OrdinalIgnoreCase)) : null;

        if (r.Multiple)
        {
            var items = node is JsonArray a ? a.ToList() : [node];
            var picked = new JsonArray();
            foreach (var item in items)
            {
                if (Match(item) is not { } option) return Fail(errors, at, $"Choose from the options for {f.Label}.");
                if (!picked.Any(p => p!.GetValue<string>() == option)) picked.Add(option);
            }

            return picked;
        }

        return Match(node) is { } one ? JsonValue.Create(one) : Fail(errors, at, $"Choose one of the options for {f.Label}.");
    }

    private static JsonNode? Id(FieldDefinition f, JsonNode node, RuleErrors errors, string at)
    {
        if (node is JsonValue v && v.TryGetValue<string>(out var s) && Guid.TryParse(s, out var id) && id != Guid.Empty)
            return JsonValue.Create(id.ToString());
        var what = f.Kind switch
        {
            FieldKind.Person => "a person from your company",
            FieldKind.Asset => "an asset",
            _ => "a file attached to this asset",
        };
        return Fail(errors, at, $"Choose {what} for {f.Label}.");
    }

    private static JsonNode? Fail(RuleErrors errors, string at, string message)
    {
        errors.Add(at, message);
        return null;
    }
}
