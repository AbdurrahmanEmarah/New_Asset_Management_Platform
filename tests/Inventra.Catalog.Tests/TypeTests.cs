using System.Net;
using System.Net.Http.Json;
using Inventra.Catalog.Api;
using Inventra.Contracts.Catalog;
using Inventra.Contracts.Shared;
using Inventra.Testing;
using static Inventra.Testing.ServiceApi<Program>;

namespace Inventra.Catalog.Tests;

public sealed class TypeTests(CatalogApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static TestUser Admin(Guid client) => TestUser.Member(client, "Ada Admin", "settings.manage", "assets.read");

    private static AssetTypeRequest Pump(string prefix = "PMP") => new("Pump", prefix, "droplet",
    [
        new(null, "Serial number", "text", true, new FieldRules(MaxLength: 40, Pattern: "[A-Z]{2}-[0-9]{4}", PatternHint: "Use the format AB-1234.")),
        new(null, "Flow rate", "number", false, new FieldRules(Min: 0, Decimals: 1, Unit: "m³/h")),
        new(null, "Duty", "choice", false, new FieldRules(Options: ["Duty", "Standby"])),
    ],
    [new(null, "In service", "ok"), new(null, "Broken", "fault")], null);

    [Fact]
    public async Task An_admin_creates_a_type_with_fields_as_data_and_it_is_published()
    {
        var client = Guid.NewGuid();
        var type = await Read<AssetTypeResponse>(await api.Client(Admin(client)).PostAsJsonAsync("/types", Pump(), Ct));
        Assert.Equal(["serial_number", "flow_rate", "duty"], type.Fields.Select(f => f.Key).ToArray());
        Assert.Equal(FieldKind.Number, type.Fields[1].Kind);
        Assert.Equal(["in_service", "broken"], type.Statuses.Select(s => s.Key).ToArray());
        Assert.Equal(1, type.Version);

        var published = await api.Events.WaitForAsync<AssetTypePublished>(e => e.TypeId == type.Id);
        Assert.Equal(("PMP", 3), (published.TagPrefix, published.Fields.Count));
        var audit = await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.TargetId == type.Id);
        Assert.Equal(("catalog", "asset_type.created", "Ada Admin"), (audit.Service, audit.Action, audit.ActorName));

        var reader = TestUser.Member(client, "Rita Reader", "assets.read");
        Assert.Single(await Read<List<AssetTypeResponse>>(await api.Client(reader).GetAsync("/types", Ct)));
        Assert.Contains("\"Asset types, sites, modules\"", await Problem(await api.Client(reader).PostAsJsonAsync("/types", Pump("XX"), Ct), HttpStatusCode.Forbidden));
        Assert.Empty(await Read<List<AssetTypeResponse>>(await api.Client(Admin(Guid.NewGuid())).GetAsync("/types", Ct)));
    }

    [Fact]
    public async Task Every_definition_problem_is_explained()
    {
        var bad = new AssetTypeRequest("", "1x", null,
        [
            new(null, "", "colour", false, null),
            new("dup", "A", "text", false, new FieldRules(MinLength: 10, MaxLength: 5)),
            new("dup", "B", "choice", false, new FieldRules(Options: [])),
            new(null, "Code", "text", false, new FieldRules(Pattern: "([")),
        ],
        [new(null, "Odd", "purple")], null);
        var errors = await FieldErrors(await api.Client(Admin(Guid.NewGuid())).PostAsJsonAsync("/types", bad, Ct));
        Assert.Equal("Name is required, e.g. Pump.", errors["name"][0]);
        Assert.Contains("2 to 8 letters", errors["tagPrefix"][0]);
        Assert.Contains("Choose a kind", errors["fields[0].kind"][0]);
        Assert.Equal("Label is required.", errors["fields[0].label"][0]);
        Assert.Contains("can't be more than the longest", errors["fields[1].rules"][0]);
        Assert.Contains("already uses the key \"dup\"", errors["fields[2].key"][0]);
        Assert.Contains("at least one option", errors["fields[2].rules"][0]);
        Assert.Contains(errors["fields[3].rules"], m => m.Contains("isn't a valid regular expression"));
        Assert.Contains("ok, warn, fault, info or none", errors["statuses[0].meaning"][0]);
    }

    [Fact]
    public async Task Edits_keep_keys_refuse_kind_changes_and_stale_versions()
    {
        var admin = api.Client(Admin(Guid.NewGuid()));
        var type = await Read<AssetTypeResponse>(await admin.PostAsJsonAsync("/types", Pump(), Ct));
        var fields = type.Fields.Select(f => new FieldRequest(f.Key, f.Label, f.Kind.ToString(), f.Required, f.Rules)).ToList();
        var statuses = type.Statuses.Select(s => new StatusRequest(s.Key, s.Label, s.Meaning)).ToList();

        fields[0] = fields[0] with { Label = "Serial no." };
        fields.RemoveAt(2);
        fields.Add(new(null, "Installed on", "date", false, new FieldRules(NotInFuture: true)));
        var updated = await Read<AssetTypeResponse>(await admin.PutAsJsonAsync($"/types/{type.Id}", new AssetTypeRequest("Pump", "PUMP", "droplet", fields, statuses, 1), Ct));
        Assert.Equal(["serial_number", "flow_rate", "installed_on"], updated.Fields.Select(f => f.Key).ToArray());
        Assert.Equal(("Serial no.", "PUMP", 2), (updated.Fields[0].Label, updated.TagPrefix, updated.Version));

        Assert.Contains("Reload it", await Problem(await admin.PutAsJsonAsync($"/types/{type.Id}", new AssetTypeRequest("Pump", "PUMP", "droplet", fields, statuses, 1), Ct), HttpStatusCode.Conflict));
        fields[1] = fields[1] with { Kind = "text" };
        Assert.Contains("can't become a text field", await Problem(await admin.PutAsJsonAsync($"/types/{type.Id}", new AssetTypeRequest("Pump", "PUMP", "droplet", fields, statuses, 2), Ct), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Prefixes_and_names_are_unique_per_company_and_archived_types_can_be_restored()
    {
        var client = Guid.NewGuid();
        var admin = api.Client(Admin(client));
        var type = await Read<AssetTypeResponse>(await admin.PostAsJsonAsync("/types", Pump(), Ct));
        Assert.Contains("already uses the prefix PMP", (await FieldErrors(await admin.PostAsJsonAsync("/types", Pump() with { Name = "Other" }, Ct)))["tagPrefix"][0]);
        Assert.Contains("already exists", (await FieldErrors(await admin.PostAsJsonAsync("/types", Pump("PM2"), Ct)))["name"][0]);
        await Read<AssetTypeResponse>(await api.Client(Admin(Guid.NewGuid())).PostAsJsonAsync("/types", Pump(), Ct)); // another company may reuse it

        var archived = await Read<AssetTypeResponse>(await admin.PostAsync($"/types/{type.Id}/archive", null, Ct));
        Assert.True(archived.IsArchived);
        Assert.Empty(await Read<List<AssetTypeResponse>>(await admin.GetAsync("/types", Ct)));
        Assert.Single(await Read<List<AssetTypeResponse>>(await admin.GetAsync("/types?includeArchived=true", Ct)));
        Assert.Contains("already archived", await Problem(await admin.PostAsync($"/types/{type.Id}/archive", null, Ct), HttpStatusCode.Conflict));
        Assert.False((await Read<AssetTypeResponse>(await admin.PostAsync($"/types/{type.Id}/restore", null, Ct))).IsArchived);
    }

    [Fact]
    public async Task Clients_copy_templates_and_the_platform_owner_manages_the_library()
    {
        var admin = api.Client(Admin(Guid.NewGuid()));
        var templates = await Read<List<TemplateResponse>>(await admin.GetAsync("/templates", Ct));
        Assert.Contains(templates, t => t.Key == "pump");
        var copy = await Read<AssetTypeResponse>(await admin.PostAsJsonAsync("/types/from-template", new FromTemplateRequest("vehicle", null, null), Ct));
        Assert.Equal(("Vehicle", "VEH", "vehicle"), (copy.Name, copy.TagPrefix, copy.TemplateKey));
        Assert.Contains(copy.Fields, f => f.Key == "registration" && f.Required);
        Assert.Contains("isn't in the library", await Problem(await admin.PostAsJsonAsync("/types/from-template", new FromTemplateRequest("nope", null, null), Ct), HttpStatusCode.NotFound));

        var key = $"t_{Guid.NewGuid():N}"[..20];
        var body = new TemplateRequest("Generator", "Standby generators", "Power", "GEN", "bolt", [new(null, "Rating", "number", false, new FieldRules(Unit: "kVA"))], [new(null, "Ready", "ok")]);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(TestUser.PlatformSupport).PutAsJsonAsync($"/platform/templates/{key}", body, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/platform/templates/{key}", body, Ct)).StatusCode);
        var saved = await Read<TemplateResponse>(await api.Client(TestUser.PlatformOwner).PutAsJsonAsync($"/platform/templates/{key}", body, Ct));
        Assert.Equal("rating", saved.Fields[0].Key);
        await api.Events.WaitForAsync<PlatformChangeRecorded>(e => e.Details.Contains(key));
        Assert.Equal(HttpStatusCode.NoContent, (await api.Client(TestUser.PlatformOwner).DeleteAsync($"/platform/templates/{key}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Support_passes_are_read_only_unless_change_and_every_request_is_recorded()
    {
        var client = Guid.NewGuid();
        await Read<AssetTypeResponse>(await api.Client(Admin(client)).PostAsJsonAsync("/types", Pump(), Ct));
        Assert.Single(await Read<List<AssetTypeResponse>>(await api.Support(client).GetAsync("/types", Ct)));
        Assert.Contains("read-only", await Problem(await api.Support(client).PostAsJsonAsync("/types", Pump("SUP"), Ct), HttpStatusCode.Forbidden));
        await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.ClientId == client && e.Details.Contains("(refused: read-only pass)"));
        await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.ClientId == client && e.Action == "support.request" && e.Details == "catalog: GET /types");

        var created = await Read<AssetTypeResponse>(await api.Support(client, "change").PostAsJsonAsync("/types", Pump("SUP") with { Name = "Fixed by support" }, Ct));
        var audit = await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.TargetId == created.Id);
        Assert.Equal(("support", TestCallerDirectory.PassId), (audit.ActorKind, audit.SupportPassId));
        Assert.Equal(HttpStatusCode.Forbidden, (await api.Client(TestUser.PlatformOwner).GetAsync("/types", Ct)).StatusCode);
    }

    [Fact]
    public async Task The_contract_matches_and_the_model_has_no_pending_changes()
    {
        await api.AssertContractAsync("catalog");
        await using var scope = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.CreateAsyncScope(api.Services);
        var db = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<Data.CatalogDbContext>(scope.ServiceProvider);
        Assert.False(Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions.HasPendingModelChanges(db.Database));
    }
}

public sealed class RowSecurityTests(CatalogApi api)
{
    [Fact]
    public Task Client_tables_have_forced_policies_and_templates_are_shared() =>
        api.AssertRowSecurityAsync(Data.CatalogDbContext.TenantTables, Data.CatalogDbContext.SharedTables);
}
