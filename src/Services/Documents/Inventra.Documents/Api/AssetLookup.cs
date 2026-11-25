using System.Net;
using System.Net.Http.Json;

namespace Inventra.Documents.Api;

/// <summary>What Documents needs to know about an asset, as the caller sees it in Assets.</summary>
public sealed record AssetAccess(Guid Id, string Tag, string? CannotEditReason);

/// <summary>
/// Asks Assets about an asset with the caller's own token and support pass, so Assets applies its own
/// rules (the asset exists, and is at a site the caller's role covers). Replaced by a fake in tests.
/// </summary>
public interface IAssetLookup
{
    /// <summary>The asset, or null when it doesn't exist or the caller can't see it.</summary>
    Task<AssetAccess?> FindAsync(HttpContext http, Guid assetId, CancellationToken ct);
}

internal sealed class AssetsServiceLookup(HttpClient http, ILogger<AssetsServiceLookup> logger) : IAssetLookup
{
    public async Task<AssetAccess?> FindAsync(HttpContext context, Guid assetId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/assets/{assetId}");
        request.Headers.TryAddWithoutValidation("Authorization", context.Request.Headers.Authorization.ToString());
        var pass = context.Request.Headers["X-Support-Pass"].ToString();
        if (pass.Length > 0) request.Headers.TryAddWithoutValidation("X-Support-Pass", pass);

        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden) return null;
        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Assets answered {Status} for asset {AssetId}", (int)response.StatusCode, assetId);
            throw new HttpRequestException($"Assets answered {(int)response.StatusCode}.");
        }

        return await response.Content.ReadFromJsonAsync<AssetAccess>(ct);
    }
}
