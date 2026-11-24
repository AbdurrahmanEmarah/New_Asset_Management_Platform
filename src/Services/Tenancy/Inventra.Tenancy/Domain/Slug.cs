using System.Text.RegularExpressions;

namespace Inventra.Tenancy.Domain;

/// <summary>Rules for a client's sub-domain.</summary>
public static partial class Slug
{
    public const int MinLength = 3;
    public const int MaxLength = 32;

    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    {
        "admin", "api", "app", "apps", "auth", "login", "www", "mail", "static", "assets", "cdn",
        "status", "support", "help", "docs", "billing", "inventra", "platform", "staging", "dev",
    };

    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")]
    private static partial Regex Pattern();

    /// <summary>The problem with this sub-domain, or null when it's fine.</summary>
    public static string? Problem(string? slug)
    {
        if (string.IsNullOrWhiteSpace(slug)) return "Sub-domain is required.";
        if (slug.Length < MinLength || slug.Length > MaxLength) return $"Use {MinLength} to {MaxLength} characters.";
        if (!Pattern().IsMatch(slug)) return "Use lowercase letters, numbers and dashes, starting and ending with a letter or number.";
        if (slug.Contains("--", StringComparison.Ordinal)) return "Don't use two dashes in a row.";
        if (Reserved.Contains(slug)) return $"\"{slug}\" is reserved. Choose another sub-domain.";
        return null;
    }
}
