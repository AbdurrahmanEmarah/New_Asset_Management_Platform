using Inventra.BuildingBlocks.Clients;
using Inventra.Contracts.Access;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Inventra.Testing;

/// <summary>
/// Stands in for Access in client services' tests. A tenant TestUser is a member whose Roles are
/// permissions ("owner" makes an Owner). A platform TestUser with the header
/// "X-Support-Pass: test:{clientId}:read|change" acts under a support pass. Anyone else is refused, like Access would.
/// </summary>
public sealed class TestCallerDirectory : ICallerDirectory
{
    public static readonly Guid PassId = Guid.Parse("00000000-0000-0000-0000-00000000aaaa");

    public Task<CallerLookup> LookupAsync(HttpContext http, CancellationToken ct)
    {
        if (!http.Request.Headers.TryGetValue(TestUser.Header, out var raw) || string.IsNullOrEmpty(raw))
            return Task.FromResult(CallerLookup.Refused(401, "Sign in first."));
        var user = TestUser.Decode(raw!);
        var pass = http.Request.Headers["X-Support-Pass"].ToString();

        if (user.Realm == "platform" && pass.StartsWith("test:", StringComparison.Ordinal))
        {
            var parts = pass.Split(':');
            var info = new CallerInfo(Guid.Parse(parts[1]), "Test Co.", user.Id, $"{user.Name} (Inventra support)", "support", null, false,
                PermissionNames.Labels.Keys.ToList(), [], PassId, ReadOnly: parts[2] != "change");
            return Task.FromResult(new CallerLookup(info, 200, null));
        }

        if (user.Realm != "tenant" || user.TenantId is not { } tenant)
            return Task.FromResult(CallerLookup.Refused(403, "Platform staff can't see client data without a support pass."));

        var owner = user.Roles.Contains("owner");
        var permissions = owner ? PermissionNames.Labels.Keys.ToList() : user.Roles.Where(r => r.Contains('.')).ToList();
        var member = new CallerInfo(tenant, "Test Co.", user.Id, user.Name, "user", Guid.NewGuid(), owner,
            permissions, [new CallerGrant(permissions, user.Sites)], null, false);
        return Task.FromResult(new CallerLookup(member, 200, null));
    }
}

public static class TestCallerExtensions
{
    public static IServiceCollection AddTestCallers(this IServiceCollection services)
    {
        services.RemoveAll<ICallerDirectory>();
        services.AddSingleton<ICallerDirectory, TestCallerDirectory>();
        return services;
    }
}
