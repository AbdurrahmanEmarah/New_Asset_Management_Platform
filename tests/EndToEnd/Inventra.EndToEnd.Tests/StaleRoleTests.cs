using System.Text.Json;

namespace Inventra.EndToEnd.Tests;

/// <summary>BUG A (fixed in milestone 03): a save from a stale copy of a role answers 409 instead of silently overwriting.</summary>
public sealed class StaleRoleTests(PlatformStack stack) : AccessTest(stack)
{
    [Fact]
    public async Task A_role_saved_from_a_stale_copy_answers_409_instead_of_overwriting()
    {
        var (_, owner) = await JoinedClientAsync("Stale");
        var roles = (await ApiAsync(owner, "GET", "/roles")).Body;
        var role = roles.EnumerateArray().First(r => r.GetProperty("name").GetString() == "Technician");
        var roleId = role.GetProperty("id").GetString();
        var version = role.GetProperty("version").GetUInt32();
        var original = role.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()!).ToList();
        var all = (await ApiAsync(owner, "GET", "/permissions")).Body.EnumerateArray()
            .SelectMany(area => area.GetProperty("permissions").EnumerateArray().Select(p => p.GetProperty("key").GetString()!))
            .Where(p => !original.Contains(p)).Take(2).ToList();

        // Two admins opened the role at the same time. The first saves with one more permission.
        var first = await ApiAsync(owner, "PUT", $"/roles/{roleId}", new { name = "Technician", description = role.GetProperty("description").GetString(), permissions = original.Append(all[0]).ToArray(), version });
        Assert.True(first.Status == 200, $"The first save answered {first.Status}: {first.Body}");

        // The second still has the old copy and saves a different permission: it must not silently undo the first.
        var second = await ApiAsync(owner, "PUT", $"/roles/{roleId}", new { name = "Technician", description = role.GetProperty("description").GetString(), permissions = original.Append(all[1]).ToArray(), version });
        Assert.True(second.Status == 409, $"The stale save answered {second.Status}, and the role now has: {(await ApiAsync(owner, "GET", $"/roles/{roleId}")).Body.GetProperty("permissions")}");
        Assert.False(string.IsNullOrWhiteSpace(second.Detail));
    }
}
