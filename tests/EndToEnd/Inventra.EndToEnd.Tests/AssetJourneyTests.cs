using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Inventra.EndToEnd.Tests;

/// <summary>
/// Milestone 03's main flow: a type from the template library, an asset at site A with the type's
/// fields, a photo uploaded and downloaded, a Technician limited to site B who can't see it, a read-only
/// support pass opened from the admin console, and the plan's asset limit.
/// </summary>
public sealed class AssetJourneyTests(PlatformStack stack) : AccessTest(stack)
{
    // A real 1×1 PNG: Documents checks the first bytes, not the file name.
    private static readonly byte[] Photo = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    [Fact]
    public async Task From_template_to_asset_photo_site_scope_support_pass_and_the_asset_limit()
    {
        var (company, owner) = await JoinedClientAsync("Assets");
        var id = Guid.NewGuid().ToString("N")[..6];
        var siteA = await NewSiteAsync(owner, $"Plant A {id}", "PLA");
        var siteB = await NewSiteAsync(owner, $"Plant B {id}", "PLB");

        // 1. A type from the template library.
        await owner.GotoAsync(Stack.ClientUrl + "/settings/asset-types");
        await owner.GetByRole(AriaRole.Button, new() { Name = "Add from template library" }).ClickAsync();
        var library = owner.GetByRole(AriaRole.Dialog, new() { Name = "Add from template library" });
        await library.GetByRole(AriaRole.Radio, new() { NameRegex = new Regex("^HVAC unit") }).CheckAsync();
        await Expect(library.GetByRole(AriaRole.Textbox, new() { Name = "Tag prefix" })).ToHaveValueAsync("HVAC");
        await library.GetByRole(AriaRole.Button, new() { Name = "Add type" }).ClickAsync();
        await Expect(library).ToBeHiddenAsync();
        await Expect(owner.GetByRole(AriaRole.Group, new() { Name = "Asset types" }).GetByText("HVAC unit")).ToBeVisibleAsync();

        // 2. An asset at site A, with the type's fields.
        await owner.GotoAsync(Stack.ClientUrl + "/assets");
        await owner.GetByRole(AriaRole.Button, new() { Name = "New asset" }).ClickAsync();
        await owner.GetByRole(AriaRole.Combobox, new() { Name = "Asset type" }).SelectOptionAsync(new SelectOptionValue { Label = "HVAC unit" });
        await owner.GetByRole(AriaRole.Textbox, new() { Name = "Name", Exact = true }).FillAsync("Chiller CH-4");
        await owner.GetByRole(AriaRole.Combobox, new() { Name = "Site", Exact = true }).SelectOptionAsync(new SelectOptionValue { Label = siteA.Name });
        await owner.GetByRole(AriaRole.Textbox, new() { Name = "Manufacturer" }).FillAsync("Carrier");
        await owner.GetByRole(AriaRole.Textbox, new() { Name = "Serial number" }).FillAsync($"SN-{id}");
        await owner.GetByLabel("Cooling capacity").FillAsync("350");
        await owner.GetByRole(AriaRole.Combobox, new() { Name = "Refrigerant" }).SelectOptionAsync(new SelectOptionValue { Label = "R-410A" });
        await owner.GetByLabel("Installed on").FillAsync("2024-03-15");

        // Assets learns sites and types by events, so the first save may say "try again in a few seconds".
        await SaveUntilAcceptedAsync(owner, "Create asset", owner.GetByRole(AriaRole.Heading, new() { Name = "Chiller CH-4", Level = 1 }));
        await Expect(owner.GetByText("HVAC-000001").First).ToBeVisibleAsync();
        await Expect(owner.GetByText("Carrier").First).ToBeVisibleAsync();
        await Expect(owner.GetByText(new Regex("350\\s*kW")).First).ToBeVisibleAsync();
        var assetId = owner.Url.Split('/').Last();

        // 3. Upload a photo, then download it: the same bytes come back.
        await owner.GetByRole(AriaRole.Tab, new() { NameRegex = new Regex("^Documents") }).ClickAsync();
        await owner.GetByLabel("Choose files to upload").SetInputFilesAsync(new FilePayload { Name = "chiller.png", MimeType = "image/png", Buffer = Photo });
        await Expect(owner.GetByText("The file was uploaded.")).ToBeVisibleAsync();
        var docs = await ApiAsync(owner, "GET", $"/api/documents/assets/{assetId}/documents");
        var documentId = docs.Body.EnumerateArray().Single().GetProperty("id").GetString();
        var photoLink = await ApiAsync(owner, "GET", $"/api/documents/documents/{documentId}/link");
        Assert.True(photoLink.Status == 200, $"The download link answered {photoLink.Status}: {photoLink.Body}");
        var url = photoLink.Body.GetProperty("url").GetString()!;
        byte[] downloaded;
        using (var http = new HttpClient())
        {
            using var response = await http.GetAsync(url, TestContext.Current.CancellationToken);
            Assert.True(response.IsSuccessStatusCode, $"The storage link {url} answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}");
            downloaded = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        }
        Assert.Equal(Convert.ToHexString(SHA256.HashData(Photo)), Convert.ToHexString(SHA256.HashData(downloaded)));

        // 4. A Technician limited to site B: the asset and its photo are "not found".
        var techEmail = $"tech-{id}@example.com";
        var link = await InviteAsync(owner, "Tess Tech", techEmail, "Technician", siteB.Name);
        var tech = await NewPageAsync();
        await JoinAsync(tech, link, techEmail, "Tess", "Tech", company);
        Assert.Equal(404, (await ApiAsync(tech, "GET", $"/api/assets/assets/{assetId}")).Status);
        Assert.Equal(404, (await ApiAsync(tech, "GET", $"/api/documents/documents/{documentId}/link")).Status);
        Assert.DoesNotContain("HVAC-000001", (await ApiAsync(tech, "GET", "/api/assets/assets")).Body.GetRawText(), StringComparison.Ordinal);
        await tech.GotoAsync($"{Stack.ClientUrl}/assets/{assetId}");
        await Expect(tech.GetByText(new Regex("This asset didn't load: .*")).First).ToBeVisibleAsync();
        await Expect(tech.GetByRole(AriaRole.Heading, new() { Name = "Chiller CH-4" })).ToHaveCountAsync(0);

        // 5. A read-only support pass, opened from the admin console's Support access page.
        var support = await NewPageAsync();
        await SignInAsync(support, StaffAccount.Support);
        await support.GetByRole(AriaRole.Link, new() { Name = "Support access" }).ClickAsync();
        await support.GetByRole(AriaRole.Combobox, new() { Name = "Client" }).SelectOptionAsync(new SelectOptionValue { Label = $"{company} ({company.ToLowerInvariant().Replace(' ', '-')})" });
        await support.GetByRole(AriaRole.Button, new() { Name = "Request access" }).ClickAsync();
        var request = support.GetByRole(AriaRole.Dialog, new() { Name = $"Support access to {company}" });
        await request.GetByLabel("Reason (shown to the client)").FillAsync("Ticket E2E-99: chiller data looks wrong.");
        await request.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("^Start .* session$") }).ClickAsync();
        var workspace = await support.Context.RunAndWaitForPageAsync(() =>
            support.GetByRole(AriaRole.Button, new() { Name = "Open workspace" }).ClickAsync());

        // The client app signs Support in with the platform realm (the admin console's Keycloak session).
        var signIn = workspace.GetByRole(AriaRole.Button, new() { Name = "Sign in" });
        var banner = workspace.GetByText(new Regex("^Support session: you're in"));
        await Expect(signIn.Or(banner)).ToBeVisibleAsync(new() { Timeout = 30_000 });
        if (await signIn.IsVisibleAsync()) await signIn.ClickAsync();
        await Expect(banner).ToBeVisibleAsync(new() { Timeout = 30_000 });
        await workspace.GotoAsync($"{Stack.ClientUrl}/assets/{assetId}");
        await Expect(workspace.GetByRole(AriaRole.Heading, new() { Name = "Chiller CH-4", Level = 1 })).ToBeVisibleAsync();
        var edit = workspace.GetByRole(AriaRole.Button, new() { Name = "Edit", Exact = true });
        await Expect(edit).ToHaveAttributeAsync("aria-disabled", "true");

        var pass = await workspace.EvaluateAsync<string>("() => sessionStorage.getItem('inventra.supportPass')");
        var header = ("X-Support-Pass", pass);
        Assert.Equal(200, (await ApiAsync(workspace, "GET", $"/api/assets/assets/{assetId}", header: header)).Status);
        var refused = await ApiAsync(workspace, "PUT", $"/api/assets/assets/{assetId}",
            new { name = "Renamed by support", statusKey = (string?)null, location = (string?)null, parentId = (string?)null, values = new { } }, header);
        Assert.True(refused.Status == 403, $"A write under a read-only pass answered {refused.Status}: {refused.Body}");

        // Both the view and the refused change reach the client's audit log, under Support's name.
        await ExpectInAuditAsync(owner, StaffAccount.Support.Name, "Chiller CH-4");

        // 6. The plan's asset limit (Trial: 500) blocks with its sentence.
        var typeId = (await ApiAsync(owner, "GET", $"/api/assets/assets/{assetId}")).Body.GetProperty("typeId").GetString()!;
        var created = await FillToLimitAsync(owner, typeId, siteA.Id, limit: 500);
        Assert.Equal(499, created);
        var blocked = await ApiAsync(owner, "POST", "/api/assets/assets", NewAsset(typeId, siteA.Id, "One too many"));
        Assert.True(blocked.Status == 409, $"The 501st asset answered {blocked.Status}: {blocked.Body}");
        Assert.Contains("500", blocked.Detail, StringComparison.Ordinal);
    }

    // BUG D: the next tag number is read and written without a lock, so simultaneous creates of one type
    // pick the same tag and the loser gets a 500 (duplicate key ix_assets_tenant_id_tag).
    [Fact(Skip = "Waiting for tag numbering that is safe under concurrency (Backend, milestone 03)")]
    public async Task Assets_added_at_the_same_time_get_distinct_tags()
    {
        var (_, owner) = await JoinedClientAsync("Tags");
        var site = await NewSiteAsync(owner, "Tag yard", "TGY");
        var type = await ApiAsync(owner, "POST", "/api/catalog/types/from-template", new { templateKey = "pump", name = "Pump", tagPrefix = "PMP" });
        Assert.True(type.Status == 201, $"From template answered {type.Status}: {type.Body}");
        var typeId = type.Body.GetProperty("id").GetString()!;

        var statuses = await owner.EvaluateAsync<int[]>(
            """
            async ([url, typeId, siteId]) => {
              const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
              const token = JSON.parse(sessionStorage.getItem(key)).access_token;
              const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
              const post = (i) => fetch(url, { method: 'POST', headers, body: JSON.stringify({ typeId, siteId, name: `Pump ${i}`, statusKey: null, location: null, parentId: null, values: {} }) });
              // Wait until Assets knows the type and site (it may say "try again in a few seconds").
              for (let tries = 0; tries < 20 && (await post('warm-up')).status !== 201; tries++) await new Promise(r => setTimeout(r, 1000));
              const answers = await Promise.all([...Array(10).keys()].map(post));
              return answers.map(r => r.status);
            }
            """,
            new object[] { $"{Stack.GatewayUrl}/api/assets/assets", typeId, site.Id });
        Assert.All(statuses, s => Assert.Equal(201, s));

        var list = await ApiAsync(owner, "GET", $"/api/assets/assets?typeId={typeId}&pageSize=50");
        var tags = list.Body.GetProperty("items").EnumerateArray().Select(a => a.GetProperty("tag").GetString()).ToList();
        Assert.Equal(11, tags.Distinct().Count());
    }

    private async Task<(string Id, string Name)> NewSiteAsync(IPage owner, string name, string code)
    {
        var site = await ApiAsync(owner, "POST", "/sites", new { name, code, isActive = true });
        Assert.True(site.Status == 201, $"Adding {name} answered {site.Status}: {site.Body}");
        return (site.Body.GetProperty("id").GetString()!, name);
    }

    /// <summary>
    /// Clicks the save button until the page shows <paramref name="done"/>. While Assets is still learning
    /// the client's sites and types (by event) it answers "try again in a few seconds", so click again
    /// like a person would, for at most 20 seconds.
    /// </summary>
    private static async Task SaveUntilAcceptedAsync(IPage page, string button, ILocator done)
    {
        var save = page.GetByRole(AriaRole.Button, new() { Name = button });
        var later = page.GetByText(new Regex("try again in a few seconds", RegexOptions.IgnoreCase)).First;
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            await save.ClickAsync();
            await Expect(done.Or(later)).ToBeVisibleAsync();
            if (await done.IsVisibleAsync() || DateTime.UtcNow > deadline) break;
            await page.WaitForTimeoutAsync(1000);
        }
        await Expect(done).ToBeVisibleAsync(new() { Timeout = 1 });
    }

    /// <summary>ClientActivityRecorded reaches Access by event; wait for it like a person refreshing the page.</summary>
    private async Task ExpectInAuditAsync(IPage owner, string who, string what)
    {
        var deadline = DateTime.UtcNow.AddSeconds(20);
        string text;
        while (true)
        {
            text = (await ApiAsync(owner, "GET", "/audit")).Body.GetRawText();
            var mine = text.Split(who).Length - 1;
            if ((mine >= 2 && text.Contains(what, StringComparison.Ordinal)) || DateTime.UtcNow > deadline) break;
            await owner.WaitForTimeoutAsync(1000);
        }
        Assert.True(text.Split(who).Length - 1 >= 2, $"The client audit doesn't list both of {who}'s actions on {what}: {text}");
    }

    private static object NewAsset(string typeId, string siteId, string name) =>
        new { typeId, name, statusKey = (string?)null, siteId, location = (string?)null, parentId = (string?)null, values = new { } };

    /// <summary>
    /// Creates assets by API one after another until the plan's limit is reached, and returns how many it
    /// made. One at a time on purpose: parallel creates of one type collide on tag numbers (BUG D, see
    /// <see cref="Assets_added_at_the_same_time_get_distinct_tags"/>).
    /// </summary>
    private async Task<int> FillToLimitAsync(IPage owner, string typeId, string siteId, int limit)
    {
        var result = await owner.EvaluateAsync<JsonElement>(
            """
            async ([url, typeId, siteId, limit]) => {
              const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
              const token = JSON.parse(sessionStorage.getItem(key)).access_token;
              const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
              let made = 0;
              for (let i = 0; i < limit; i += 1) {
                const batch = [];
                for (let j = i; j < Math.min(i + 1, limit); j++) {
                  batch.push(fetch(url, { method: 'POST', headers, body: JSON.stringify({ typeId, siteId, name: `Filler ${j}`, statusKey: null, location: null, parentId: null, values: {} }) }));
                }
                const answers = await Promise.all(batch);
                made += answers.filter(r => r.status === 201).length;
                const refused = answers.find(r => r.status !== 201);
                if (refused) return { made, status: refused.status, body: await refused.text() };
              }
              return { made, status: 201, body: '' };
            }
            """,
            new object[] { $"{Stack.GatewayUrl}/api/assets/assets", typeId, siteId, limit - 1 });
        var made = result.GetProperty("made").GetInt32();
        Assert.True(made == limit - 1, $"Only {made} assets were created before a {result.GetProperty("status")}: {result.GetProperty("body")}");
        return made;
    }
}
