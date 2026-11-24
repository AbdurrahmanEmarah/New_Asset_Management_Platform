using Microsoft.AspNetCore.Http;

namespace Inventra.BuildingBlocks.Http;

/// <summary>
/// Error responses with a plain-language "detail" the apps can show as-is.
/// Every refusal says what went wrong and how to fix it.
/// </summary>
public static class Problems
{
    public static IResult Validation(IDictionary<string, string[]> errors) =>
        TypedResults.ValidationProblem(errors, title: "Some fields need attention.", detail: "Fix the highlighted fields and try again.");

    public static IResult Conflict(string detail) =>
        TypedResults.Problem(detail: detail, statusCode: StatusCodes.Status409Conflict, title: "That can't be done right now.");

    public static IResult NotFound(string detail) =>
        TypedResults.Problem(detail: detail, statusCode: StatusCodes.Status404NotFound, title: "Not found.");

    /// <summary>403: signed in, but not allowed. Say who can grant the access.</summary>
    public static IResult Forbidden(string detail) =>
        TypedResults.Problem(detail: detail, statusCode: StatusCodes.Status403Forbidden, title: "You can't do that.");

    /// <summary>503: a service this request depends on is unavailable. Say whether to retry.</summary>
    public static IResult Unavailable(string detail) =>
        TypedResults.Problem(detail: detail, statusCode: StatusCodes.Status503ServiceUnavailable, title: "Please try again shortly.");
}

/// <summary>Collects field errors and turns them into a validation problem.</summary>
public sealed class FieldErrors
{
    private readonly Dictionary<string, List<string>> _errors = new(StringComparer.Ordinal);

    public bool Any => _errors.Count > 0;

    public FieldErrors Add(string field, string message)
    {
        if (!_errors.TryGetValue(field, out var list)) _errors[field] = list = [];
        list.Add(message);
        return this;
    }

    public FieldErrors Require(string field, string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value)) Add(field, $"{label} is required.");
        return this;
    }

    public IResult ToResult() => Problems.Validation(_errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray()));
}
