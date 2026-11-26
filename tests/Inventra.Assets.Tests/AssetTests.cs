using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Inventra.Assets.Api;
using Inventra.Contracts.Assets;
using Inventra.Contracts.Catalog;
using Inventra.Contracts.Shared;
using Inventra.Testing;
using static Inventra.Testing.ServiceApi<Program>;

namespace Inventra.Assets.Tests;

public sealed class AssetTests(AssetsApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static TestUser Manager(Guid client, params Guid[] sites) =>
        TestUser.Member(client, "Max Manager", "assets.read", "assets.write", "assets.transfer", "assets.dispose") with { Sites = sites };

    private static CreateAssetRequest Pump(Guid typeId, string name = "Chilled water pump 1", Guid? siteId = null, JsonObject? values = null, Guid? parentId = null) =>
        new(typeId, name, null, siteId, "Plant room", parentId, values ?? new JsonObject { ["serial_number"] = "AB-1234", ["flow_rate"] = 12.5 });

    [Fact]
    public async Task Registering_an_asset_gives_it_a_tag_validated_values_an_audit_entry_and_a_count()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));

        var first = await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId), Ct));
        var second = await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Pump 2"), Ct));
        Assert.Equal(("PMP-000001", "PMP-000002"), (first.Tag, second.Tag));
        Assert.Equal(("in_service", "ok"), (first.Status.Key, first.Status.Meaning));
        Assert.Equal(12.5m, first.Values["flow_rate"]!.GetValue<decimal>());
        Assert.Equal("Plant room", first.Location);

        await api.Events.WaitForAsync<ClientAssetsCounted>(e => e.ClientId == client && e.Assets == 2);
        var audit = await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.TargetId == first.Id);
        Assert.Equal(("assets", "asset.created"), (audit.Service, audit.Action));
        Assert.Contains("PMP-000001", audit.Details);
    }

    [Fact]
    public async Task Values_are_checked_against_the_types_fields_with_plain_messages()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var values = new JsonObject
        {
            ["serial_number"] = "bad", ["flow_rate"] = 12.55, ["duty"] = "Sometimes",
            ["installed_on"] = DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd"), ["feeds"] = Guid.NewGuid().ToString(), ["colour"] = "red",
        };
        var errors = await FieldErrors(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId, "", values: values) with { StatusKey = "melted" }, Ct));
        Assert.Equal("Name is required, e.g. Chilled water pump 2.", errors["name"][0]);
        Assert.Equal("Use the format AB-1234.", errors["values.serial_number"][0]);
        Assert.Equal("Use at most 1 decimal places.", errors["values.flow_rate"][0]);
        Assert.Contains("Choose one of the options for Duty", errors["values.duty"][0]);
        Assert.Equal("Installed on can't be in the future.", errors["values.installed_on"][0]);
        Assert.Contains("linked asset doesn't exist", errors["values.feeds"][0]);
        Assert.Contains("no field \"colour\"", errors["values.colour"][0]);
        Assert.Contains("Choose one of Pump's statuses", errors["statusKey"][0]);

        errors = await FieldErrors(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId, values: []), Ct));
        Assert.Equal("Serial number is required.", errors["values.serial_number"][0]);
    }

    [Fact]
    public async Task Changing_the_type_keeps_old_values_readable()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));
        var asset = await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId), Ct));

        await api.PumpTypeAsync(client, version: 2, typeId: type.TypeId, fields: [type.Fields[0], new("vendor", "Vendor", FieldKind.Text, false, 1, new FieldRules())]);
        await api.PumpTypeAsync(client, version: 1, typeId: type.TypeId); // a late, older version is ignored
        var reloaded = await Read<AssetResponse>(await http.GetAsync($"/assets/{asset.Id}", Ct));
        Assert.Equal(2, reloaded.TypeVersion);
        Assert.Equal("AB-1234", reloaded.Values["serial_number"]!.GetValue<string>());
        Assert.Equal(12.5m, reloaded.OtherValues["flow_rate"]!.GetValue<decimal>());

        var updated = await Read<AssetResponse>(await http.PutAsJsonAsync($"/assets/{asset.Id}",
            new UpdateAssetRequest("Pump one", "broken", "Roof", null, new JsonObject { ["serial_number"] = "CD-5678", ["vendor"] = "Grundfos" }), Ct));
        Assert.Equal(("CD-5678", "Grundfos", "fault"), (updated.Values["serial_number"]!.GetValue<string>(), updated.Values["vendor"]!.GetValue<string>(), updated.Status.Meaning));
        Assert.True(updated.OtherValues.ContainsKey("flow_rate"));
    }

    [Fact]
    public async Task Parents_form_a_hierarchy_without_loops_and_retiring_needs_the_children_gone()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));
        var plant = await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Plant"), Ct));
        var pump = await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Pump", parentId: plant.Id), Ct));
        Assert.Equal(plant.Id, pump.Parent!.Id);
        Assert.Single(await Read<List<AssetSummary>>(await http.GetAsync($"/assets/{plant.Id}/children", Ct)));

        var loop = await FieldErrors(await http.PutAsJsonAsync($"/assets/{plant.Id}",
            new UpdateAssetRequest("Plant", null, "", pump.Id, new JsonObject { ["serial_number"] = "AB-1234" }), Ct));
        Assert.Contains("can't sit under itself", loop["parentId"][0]);

        Assert.Contains("has 1 asset(s) under it", await Problem(await http.PostAsJsonAsync($"/assets/{plant.Id}/retire", new RetireAssetRequest("Demolished"), Ct), HttpStatusCode.Conflict));
        Assert.Contains("Say why", (await FieldErrors(await http.PostAsJsonAsync($"/assets/{pump.Id}/retire", new RetireAssetRequest(""), Ct)))["reason"][0]);
        var retired = await Read<AssetResponse>(await http.PostAsJsonAsync($"/assets/{pump.Id}/retire", new RetireAssetRequest("Replaced"), Ct));
        Assert.NotNull(retired.RetiredAt);
        Assert.Contains("is retired", retired.CannotEditReason);
        Assert.Contains("is retired", await Problem(await http.PutAsJsonAsync($"/assets/{pump.Id}", new UpdateAssetRequest("X", null, "", null, []), Ct), HttpStatusCode.Conflict));
        await Read<AssetResponse>(await http.PostAsJsonAsync($"/assets/{plant.Id}/retire", new RetireAssetRequest("Demolished"), Ct));
        await api.Events.WaitForAsync<ClientAssetsCounted>(e => e.ClientId == client && e.Assets == 0);
    }

    [Fact]
    public async Task The_list_filters_sorts_pages_and_shows_type_columns()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));
        foreach (var (name, serial) in new[] { ("Charlie", "CC-0003"), ("Alpha", "AA-0001"), ("Bravo", "BB-0002") })
            await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, name, values: new JsonObject { ["serial_number"] = serial }), Ct));

        var page = await Read<AssetPage>(await http.GetAsync($"/assets?typeId={type.TypeId}&sort=field:serial_number&order=desc&pageSize=2", Ct));
        Assert.Equal(3, page.Total);
        Assert.Equal(["Charlie", "Bravo"], page.Items.Select(i => i.Name).ToArray());
        Assert.Equal("serial_number", page.Columns![0].Key);
        Assert.Equal("CC-0003", page.Items[0].Values!["serial_number"]!.GetValue<string>());
        var second = await Read<AssetPage>(await http.GetAsync($"/assets?typeId={type.TypeId}&sort=name&pageSize=2&page=2", Ct));
        Assert.Equal("Charlie", Assert.Single(second.Items).Name);

        Assert.Single((await Read<AssetPage>(await http.GetAsync("/assets?search=brav", Ct))).Items);
        Assert.Null((await Read<AssetPage>(await http.GetAsync("/assets", Ct))).Columns);
        Assert.Contains("filtered by one type", (await FieldErrors(await http.GetAsync("/assets?sort=field:serial_number", Ct)))["sort"][0]);
        Assert.Empty((await Read<AssetPage>(await api.Client(Manager(Guid.NewGuid())).GetAsync("/assets", Ct))).Items);
    }

    [Fact]
    public async Task Site_scope_from_role_assignments_limits_what_people_see_and_change()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        Guid hq = await api.SiteAsync(client, "HQ"), depot = await api.SiteAsync(client, "Depot");
        var everywhere = api.Client(Manager(client));
        var atHq = await Read<AssetResponse>(await everywhere.PostAsJsonAsync("/assets", Pump(type.TypeId, "HQ pump", hq), Ct));
        var atDepot = await Read<AssetResponse>(await everywhere.PostAsJsonAsync("/assets", Pump(type.TypeId, "Depot pump", depot), Ct));
        await Read<AssetResponse>(await everywhere.PostAsJsonAsync("/assets", Pump(type.TypeId, "No site"), Ct));

        var hqOnly = api.Client(Manager(client, hq));
        Assert.Equal(["HQ pump"], (await Read<AssetPage>(await hqOnly.GetAsync("/assets", Ct))).Items.Select(i => i.Name).ToArray());
        Assert.Equal(HttpStatusCode.NotFound, (await hqOnly.GetAsync($"/assets/{atDepot.Id}", Ct)).StatusCode);
        Assert.Contains("sites where your role", await Problem(await hqOnly.PostAsJsonAsync("/assets", Pump(type.TypeId, "Sneaky", depot), Ct), HttpStatusCode.Forbidden));
        Assert.Contains("every site", await Problem(await hqOnly.PostAsJsonAsync("/assets", Pump(type.TypeId, "Sneaky"), Ct), HttpStatusCode.Forbidden));
        Assert.Contains("transfer", await Problem(await hqOnly.PostAsJsonAsync($"/assets/{atHq.Id}/move", new MoveAssetRequest(depot, ""), Ct), HttpStatusCode.Forbidden));

        var moved = await Read<AssetResponse>(await everywhere.PostAsJsonAsync($"/assets/{atHq.Id}/move", new MoveAssetRequest(depot, "Bay 3"), Ct));
        Assert.Equal((depot, "Bay 3"), (moved.SiteId, moved.Location));

        var reader = api.Client(TestUser.Member(client, "Rita Reader", "assets.read"));
        var readOnly = await Read<AssetResponse>(await reader.GetAsync($"/assets/{atDepot.Id}", Ct));
        Assert.NotNull(readOnly.CannotEditReason);
        Assert.Contains("\"Create and edit assets\"", await Problem(await reader.PostAsJsonAsync("/assets", Pump(type.TypeId), Ct), HttpStatusCode.Forbidden));
    }

    [Fact]
    public async Task The_plan_limit_archived_types_and_unknown_types_are_refused_with_a_reason()
    {
        var client = await api.ClientAsync(maxAssets: 1);
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));
        await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId), Ct));
        Assert.Contains("Your plan allows 1 assets and all 1 are in use", await Problem(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Two"), Ct), HttpStatusCode.Conflict));
        await api.DeliverAsync(new Contracts.Tenancy.ClientPlanChanged(client, "business", 25, DateTimeOffset.UtcNow, 10, 1024));
        await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Two"), Ct));

        Assert.Contains("isn't available yet", await Problem(await http.PostAsJsonAsync("/assets", Pump(Guid.NewGuid()), Ct), HttpStatusCode.Conflict));
        await api.PumpTypeAsync(client, version: 2, typeId: type.TypeId, archived: true);
        Assert.Contains("archived", await Problem(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Three"), Ct), HttpStatusCode.Conflict));

        var noLimits = Guid.NewGuid();
        var other = await api.PumpTypeAsync(noLimits);
        Assert.Contains("plan limits are still being loaded", await Problem(await api.Client(Manager(noLimits)).PostAsJsonAsync("/assets", Pump(other.TypeId), Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Support_passes_read_freely_and_change_only_with_change_access()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        await Read<AssetResponse>(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId), Ct));
        Assert.Single((await Read<AssetPage>(await api.Support(client).GetAsync("/assets", Ct))).Items);
        Assert.Contains("read-only", await Problem(await api.Support(client).PostAsJsonAsync("/assets", Pump(type.TypeId, "X"), Ct), HttpStatusCode.Forbidden));
        var fixedBySupport = await Read<AssetResponse>(await api.Support(client, "change").PostAsJsonAsync("/assets", Pump(type.TypeId, "By support"), Ct));
        var audit = await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.TargetId == fixedBySupport.Id);
        Assert.Equal("support", audit.ActorKind);
    }

    [Fact]
    public async Task Assets_go_only_to_known_active_sites()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var tower = await api.SiteAsync(client, "Tower C");
        var http = api.Client(Manager(client));
        await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, siteId: tower), Ct));

        await api.SiteAsync(client, "Tower C", active: false, id: tower);
        Assert.Equal("Tower C isn't an active site. Ask your Admin to turn it back on, or choose another site.",
            (await FieldErrors(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Two", tower), Ct)))["siteId"][0]);
        Assert.Contains("doesn't exist in your company", (await FieldErrors(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Three", Guid.NewGuid()), Ct)))["siteId"][0]);
    }

    [Fact]
    public async Task Clients_from_before_Assets_existed_get_their_limits_and_sites_backfilled()
    {
        var client = Guid.NewGuid();
        var type = await api.PumpTypeAsync(client);
        var http = api.Client(Manager(client));

        Assert.Contains("still being loaded", await Problem(await http.PostAsJsonAsync("/assets", Pump(type.TypeId), Ct), HttpStatusCode.Conflict));
        await api.Events.WaitForAsync<ClientLimitsRequested>(e => e.ClientId == client && e.Service == "assets");
        await api.DeliverAsync(new Contracts.Tenancy.ClientLimitsAnnounced(client, "business", 200, 10_000, 102_400, DateTimeOffset.UtcNow));

        var site = Guid.NewGuid();
        Assert.Contains("sites are still being loaded", await Problem(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, siteId: site), Ct), HttpStatusCode.Conflict));
        await api.Events.WaitForAsync<SitesRequested>(e => e.ClientId == client);
        await api.SiteAsync(client, "Old site", id: site);
        await Read<AssetResponse>(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, siteId: site), Ct));
        Assert.Contains("doesn't exist", (await FieldErrors(await http.PostAsJsonAsync("/assets", Pump(type.TypeId, "Two", Guid.NewGuid()), Ct)))["siteId"][0]);
        Assert.Single(api.Events.All<SitesRequested>(), e => e.ClientId == client); // asked only once
    }

    [Fact]
    public async Task Parallel_creates_of_one_type_all_succeed_with_distinct_tags()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        var first = await Read<AssetResponse>(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId, "Before"), Ct));

        var responses = await Task.WhenAll(Enumerable.Range(1, 10).Select(i =>
            api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId, $"Parallel {i}"), Ct)));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        var tags = new List<string> { first.Tag };
        foreach (var r in responses) tags.Add((await Read<AssetResponse>(r)).Tag);
        Assert.Equal(11, tags.Distinct().Count());
        Assert.Equal(Enumerable.Range(1, 11).Select(n => $"PMP-{n:D6}"), tags.Order());

        // Every asset really was saved, not just answered.
        Assert.Equal(11, (await Read<AssetPage>(await api.Client(Manager(client)).GetAsync($"/assets?typeId={type.TypeId}", Ct))).Total);
    }

    [Fact]
    public async Task A_new_counter_continues_after_the_highest_existing_tag()
    {
        var client = await api.ClientAsync();
        var type = await api.PumpTypeAsync(client);
        await Read<AssetResponse>(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId), Ct));

        // Simulate a type from before the counter existed: its counter row is gone, its assets stay.
        await using (var conn = new Npgsql.NpgsqlConnection(api.ConnectionString))
        {
            await conn.OpenAsync(Ct);
            await using var cmd = new Npgsql.NpgsqlCommand($"DELETE FROM tag_counters WHERE type_id = '{type.TypeId}'", conn);
            Assert.Equal(1, await cmd.ExecuteNonQueryAsync(Ct));
        }

        var next = await Read<AssetResponse>(await api.Client(Manager(client)).PostAsJsonAsync("/assets", Pump(type.TypeId, "After"), Ct));
        Assert.Equal("PMP-000002", next.Tag);
    }
}
