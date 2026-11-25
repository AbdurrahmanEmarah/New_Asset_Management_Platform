using System.Net;
using System.Net.Http.Json;
using Inventra.BuildingBlocks.Clients;
using Inventra.Contracts.Access;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;

namespace Inventra.BuildingBlocks.Tests;

public sealed class CallerDirectoryTests
{
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public List<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            Requests.Add(request);
            return Task.FromResult(answer(request));
        }
    }

    private static readonly CallerInfo Member = new(Guid.NewGuid(), "Co", "u1", "Uma", "user", Guid.NewGuid(), false, ["assets.read"], [new(["assets.read"], [])], null, false);

    private static (AccessCallerDirectory Directory, StubHandler Handler) Make(Func<HttpRequestMessage, HttpResponseMessage> answer)
    {
        var handler = new StubHandler(answer);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://access") };
        return (new AccessCallerDirectory(http, new MemoryCache(new MemoryCacheOptions()), NullLogger<AccessCallerDirectory>.Instance), handler);
    }

    private static DefaultHttpContext Request(string token, string? pass = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Authorization = token;
        if (pass is not null) context.Request.Headers["X-Support-Pass"] = pass;
        return context;
    }

    [Fact]
    public async Task Forwards_the_callers_token_and_pass_and_caches_the_answer()
    {
        var (directory, handler) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(Member) });
        var first = await directory.LookupAsync(Request("Bearer a", "c.p"), CancellationToken.None);
        var second = await directory.LookupAsync(Request("Bearer a", "c.p"), CancellationToken.None);
        Assert.Equal(Member.ActorId, first.Caller!.ActorId);
        Assert.Equal(Member.ActorId, second.Caller!.ActorId);
        Assert.Equal(1, handler.Calls);
        Assert.Equal("/internal/caller", handler.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal("Bearer a", handler.Requests[0].Headers.GetValues("Authorization").Single());
        Assert.Equal("c.p", handler.Requests[0].Headers.GetValues("X-Support-Pass").Single());

        await directory.LookupAsync(Request("Bearer b"), CancellationToken.None);
        Assert.Equal(2, handler.Calls); // another token is another caller
    }

    [Fact]
    public async Task Passes_on_Accesss_refusal_and_never_caches_it()
    {
        var (directory, handler) = Make(_ => new HttpResponseMessage(HttpStatusCode.Forbidden)
        {
            Content = JsonContent.Create(new { detail = "An Admin turned off your access to Co. Ask them to reactivate it." }),
        });
        var lookup = await directory.LookupAsync(Request("Bearer a"), CancellationToken.None);
        await directory.LookupAsync(Request("Bearer a"), CancellationToken.None);
        Assert.Equal((403, "An Admin turned off your access to Co. Ask them to reactivate it."), (lookup.Status, lookup.Detail));
        Assert.Equal(2, handler.Calls);
    }

    [Fact]
    public async Task An_unreachable_Access_is_a_503_that_says_to_retry()
    {
        var (directory, _) = Make(_ => throw new HttpRequestException("down"));
        var lookup = await directory.LookupAsync(Request("Bearer a"), CancellationToken.None);
        Assert.Equal(503, lookup.Status);
        Assert.Contains("Try again in a minute", lookup.Detail);
    }

    [Fact]
    public void Site_scope_is_the_union_of_the_grants_and_all_sites_wins()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid();
        var caller = new ClientCaller();
        caller.Set(Member with { Permissions = ["assets.read", "assets.write"], Grants = [new(["assets.read", "assets.write"], [a]), new(["assets.read"], [b])] });
        Assert.Equal(new[] { a, b }.Order(), caller.SitesFor("assets.read")!.Order());
        Assert.Equal([a], caller.SitesFor("assets.write")!);
        Assert.True(caller.HasAt("assets.write", a));
        Assert.False(caller.HasAt("assets.write", b));
        Assert.False(caller.HasAt("assets.write", null));

        caller.Set(Member with { Grants = [new(["assets.read"], [a]), new(["assets.read"], [])] });
        Assert.Null(caller.SitesFor("assets.read"));
        Assert.True(caller.HasAt("assets.read", null));
    }
}
