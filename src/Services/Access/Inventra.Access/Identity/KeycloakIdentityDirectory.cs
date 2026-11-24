using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Inventra.Access.Identity;

public sealed class KeycloakOptions
{
    public const string Section = "Identity:Keycloak";

    /// <summary>Keycloak's address, e.g. http://localhost:18080. Empty turns the directory off.</summary>
    public string? BaseUrl { get; set; }
    public string Realm { get; set; } = "inventra";

    /// <summary>A confidential client whose service account has realm-management's manage-users role.</summary>
    public string ClientId { get; set; } = "access-service";
    public string? ClientSecret { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(BaseUrl) && !string.IsNullOrWhiteSpace(ClientSecret);
}

/// <summary>Keycloak's admin REST API, called with the access-service client's own token.</summary>
internal sealed class KeycloakIdentityDirectory(HttpClient http, IOptions<KeycloakOptions> options, ILogger<KeycloakIdentityDirectory> logger) : IIdentityDirectory
{
    public const string TenantAttribute = "tenant_id";

    private readonly KeycloakOptions _options = options.Value;

    public Task LinkToClientAsync(string subject, Guid tenantId, CancellationToken ct) =>
        UpdateUserAsync(subject, user =>
        {
            var attributes = user["attributes"] as JsonObject ?? [];
            attributes[TenantAttribute] = new JsonArray(tenantId.ToString());
            user["attributes"] = attributes;
        }, ct);

    public Task SetSignInEnabledAsync(string subject, bool enabled, CancellationToken ct) =>
        UpdateUserAsync(subject, user => user["enabled"] = enabled, ct);

    private async Task UpdateUserAsync(string subject, Action<JsonObject> change, CancellationToken ct)
    {
        try
        {
            var token = await GetTokenAsync(ct);
            var url = $"{_options.BaseUrl!.TrimEnd('/')}/admin/realms/{_options.Realm}/users/{Uri.EscapeDataString(subject)}";

            using var get = new HttpRequestMessage(HttpMethod.Get, url);
            get.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var current = await http.SendAsync(get, ct);
            if (current.StatusCode == HttpStatusCode.NotFound)
                throw new IdentityDirectoryException("Your sign-in account wasn't found in the sign-in service. Sign out, sign in again and retry.");
            await EnsureOk(current, "read the sign-in account", ct);

            var user = await current.Content.ReadFromJsonAsync<JsonObject>(ct)
                       ?? throw new IdentityDirectoryException("The sign-in service returned an empty account. Try again in a minute.");
            change(user);

            using var put = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(user) };
            put.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var saved = await http.SendAsync(put, ct);
            await EnsureOk(saved, "update the sign-in account", ct);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Keycloak at {BaseUrl} couldn't be reached", _options.BaseUrl);
            throw new IdentityDirectoryException("The sign-in service couldn't be reached, so nothing was changed. Try again in a minute.", ex);
        }
    }

    private async Task<string> GetTokenAsync(CancellationToken ct)
    {
        using var response = await http.PostAsync(
            $"{_options.BaseUrl!.TrimEnd('/')}/realms/{_options.Realm}/protocol/openid-connect/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret!,
            }), ct);
        await EnsureOk(response, "sign in to the sign-in service", ct);
        var body = await response.Content.ReadFromJsonAsync<JsonObject>(ct);
        return body?["access_token"]?.GetValue<string>()
               ?? throw new IdentityDirectoryException("The sign-in service didn't return a token. Check the access-service client's secret.");
    }

    private async Task EnsureOk(HttpResponseMessage response, string what, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync(ct);
        logger.LogError("Keycloak refused to {What}: {Status} {Body}", what, (int)response.StatusCode, body);
        throw new IdentityDirectoryException(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
            ? $"The sign-in service refused to {what}. An administrator must check the access-service client's secret and its manage-users role."
            : $"The sign-in service couldn't {what} ({(int)response.StatusCode}). Try again in a minute.");
    }
}
