using Inventra.Access.Data;
using Inventra.Access.Domain;
using Inventra.BuildingBlocks.Http;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Inventra.Access.Api;

public static class MeEndpoints
{
    public static RouteGroupBuilder MapMeEndpoints(this RouteGroupBuilder app)
    {
        app.MapGet("/me", GetMe).WithTags("Me").WithSummary("The signed-in person, their company and what they may do. Call it after sign-in.");
        app.MapPut("/me/preferences", SetPreferences).WithTags("Me").Produces<MeResponse>().ProducesValidationProblem().ProducesProblem(409).WithSummary("Saves the person's theme: system, light or dark.");
        app.MapGet("/permissions", GetCatalog).WithTags("Roles").WithSummary("The permission catalog, grouped by area.");
        return app;
    }

    internal static Ok<MeResponse> GetMe(Caller caller) => TypedResults.Ok(ToMe(caller));

    internal static MeResponse ToMe(Caller caller) => new(
        caller.User?.Id,
        caller.User is { } u ? UserViews.DisplayName(u) : caller.ActorName,
        caller.User?.Email,
        caller.User?.Theme ?? ThemePreference.System,
        new CompanyRef(caller.Client.TenantId, caller.Client.Name, caller.Client.Slug),
        caller.IsOwner,
        caller.IsOwner ? Permissions.All : caller.Permissions.Order(StringComparer.Ordinal).ToList(),
        caller.Grants.Select(GrantResponse.From).ToList(),
        caller.Pass is { } p ? new SupportSessionResponse(p.Id, p.Access, p.ExpiresAt) : null);

    internal static async Task<IResult> SetPreferences(PreferencesRequest request, Caller caller, AccessDbContext db, CancellationToken ct)
    {
        if (caller.User is not { } user)
            return Problems.Conflict("A support session has no profile, so there are no preferences to save.");

        ThemePreference? theme = request.Theme?.Trim().ToLowerInvariant() switch
        {
            "system" => ThemePreference.System,
            "light" => ThemePreference.Light,
            "dark" => ThemePreference.Dark,
            _ => null,
        };
        if (theme is null) return new FieldErrors().Add("theme", "Choose system, light or dark.").ToResult();

        user.SetTheme(theme.Value);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(ToMe(caller));
    }

    internal static Ok<List<PermissionAreaResponse>> GetCatalog() => TypedResults.Ok(Permissions.Catalog
        .Select(a => new PermissionAreaResponse(a.Key, a.Title, a.Permissions.Select(p => new PermissionResponse(p.Key, p.Label)).ToList()))
        .ToList());
}
