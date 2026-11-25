using System.Net;
using System.Net.Http.Headers;
using Inventra.Contracts.Documents;
using Inventra.Contracts.Shared;
using Inventra.Documents.Api;
using Inventra.Testing;
using static Inventra.Testing.ServiceApi<Program>;

namespace Inventra.Documents.Tests;

public sealed class DocumentTests(DocumentsApi api)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly byte[] Pdf = [.. "%PDF-1.7\n"u8.ToArray(), .. new byte[2000]];
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, .. new byte[100]];

    private static TestUser Editor(Guid client) => TestUser.Member(client, "Eve Editor", "assets.read", "assets.write");

    private static MultipartFormDataContent File(byte[] bytes, string name)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return new MultipartFormDataContent { { content, "file", name } };
    }

    [Fact]
    public async Task Upload_list_link_and_delete_a_file_with_audit_and_storage_totals()
    {
        var client = await api.ClientAsync();
        var asset = api.Assets.Add("PMP-000001");
        var http = api.Client(Editor(client));

        var doc = await Read<DocumentResponse>(await http.PostAsync($"/assets/{asset}/documents", File(Pdf, "../../Datasheet.pdf"), Ct));
        Assert.Equal(("Datasheet.pdf", "application/pdf", Pdf.Length), (doc.FileName, doc.ContentType, (int)doc.SizeBytes));
        Assert.Single(api.Files.Blobs, b => b.Key.EndsWith($"{doc.Id:N}", StringComparison.Ordinal));
        await api.Events.WaitForAsync<ClientStorageCounted>(e => e.ClientId == client && e.Bytes == Pdf.Length);
        Assert.Contains("Attached Datasheet.pdf", (await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.ClientId == client && e.Action == "document.uploaded")).Details);

        var image = await Read<DocumentResponse>(await http.PostAsync($"/assets/{asset}/documents", File(Png, "photo.png"), Ct));
        Assert.Equal("image/png", image.ContentType);
        Assert.Equal(2, (await Read<List<DocumentResponse>>(await http.GetAsync($"/assets/{asset}/documents", Ct))).Count);
        var link = await Read<DownloadLinkResponse>(await http.GetAsync($"/documents/{doc.Id}/link", Ct));
        Assert.StartsWith("memory://", link.Url);
        Assert.InRange(link.ExpiresAt - DateTimeOffset.UtcNow, TimeSpan.FromMinutes(4), TimeSpan.FromMinutes(6));

        var usage = await Read<StorageUsageResponse>(await http.GetAsync("/usage", Ct));
        Assert.Equal((Pdf.Length + Png.Length, 1024L * 1024 * 1024, "ok"), ((int)usage.UsedBytes, usage.LimitBytes, usage.State));

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/documents/{doc.Id}", Ct)).StatusCode);
        Assert.DoesNotContain(api.Files.Blobs, b => b.Key.EndsWith($"{doc.Id:N}", StringComparison.Ordinal));
        await api.Events.WaitForAsync<ClientStorageCounted>(e => e.ClientId == client && e.Bytes == Png.Length);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/documents/{doc.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Only_pdfs_and_images_are_accepted_whatever_the_name_says()
    {
        var client = await api.ClientAsync();
        var asset = api.Assets.Add("PMP-000002");
        var http = api.Client(Editor(client));
        var errors = await FieldErrors(await http.PostAsync($"/assets/{asset}/documents", File("MZ fake exe"u8.ToArray(), "manual.pdf"), Ct));
        Assert.Equal("Upload a PDF or an image (PNG, JPEG or WebP).", errors["file"][0]);
        var empty = new MultipartFormDataContent { { new StringContent("x"), "other" } };
        Assert.Equal("Choose a file to upload.", (await FieldErrors(await http.PostAsync($"/assets/{asset}/documents", empty, Ct)))["file"][0]);
    }

    [Fact]
    public async Task The_plan_storage_limit_blocks_uploads_with_a_sentence()
    {
        var client = await api.ClientAsync(storageMb: 0);
        var asset = api.Assets.Add("PMP-000003");
        var detail = await Problem(await api.Client(Editor(client)).PostAsync($"/assets/{asset}/documents", File(Pdf, "a.pdf"), Ct), HttpStatusCode.Conflict);
        Assert.Contains("This file doesn't fit", detail);
        Assert.DoesNotContain(api.Files.Blobs, b => b.Key.StartsWith($"{client:N}", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Files_follow_their_assets_visibility_and_editability()
    {
        var client = await api.ClientAsync();
        var asset = api.Assets.Add("PMP-000004");
        var http = api.Client(Editor(client));
        var doc = await Read<DocumentResponse>(await http.PostAsync($"/assets/{asset}/documents", File(Pdf, "a.pdf"), Ct));

        Assert.Contains("site your role doesn't cover", await Problem(await http.GetAsync($"/assets/{Guid.NewGuid()}/documents", Ct), HttpStatusCode.NotFound));
        api.Assets.Visible.TryRemove(asset, out _);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/documents/{doc.Id}/link", Ct)).StatusCode);

        var retired = api.Assets.Add("PMP-000005", cannotEditReason: "PMP-000005 is retired, so it can't be changed.");
        Assert.Contains("is retired", await Problem(await http.PostAsync($"/assets/{retired}/documents", File(Pdf, "b.pdf"), Ct), HttpStatusCode.Conflict));

        var reader = api.Client(TestUser.Member(client, "Rita Reader", "assets.read"));
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsync($"/assets/{asset}/documents", File(Pdf, "c.pdf"), Ct)).StatusCode);
        Assert.Empty(await Read<List<DocumentResponse>>(await api.Client(Editor(Guid.NewGuid())).GetAsync($"/assets/{api.Assets.Add("PMP-000007")}/documents", Ct)));
    }

    [Fact]
    public async Task Support_passes_can_open_files_and_it_is_recorded()
    {
        var client = await api.ClientAsync();
        var asset = api.Assets.Add("PMP-000006");
        var doc = await Read<DocumentResponse>(await api.Client(Editor(client)).PostAsync($"/assets/{asset}/documents", File(Pdf, "a.pdf"), Ct));
        await Read<DownloadLinkResponse>(await api.Support(client).GetAsync($"/documents/{doc.Id}/link", Ct));
        await api.Events.WaitForAsync<ClientActivityRecorded>(e => e.ClientId == client && e.Action == "document.opened" && e.ActorKind == "support");
        Assert.Contains("read-only", await Problem(await api.Support(client).DeleteAsync($"/documents/{doc.Id}", Ct), HttpStatusCode.Forbidden));
    }
}
