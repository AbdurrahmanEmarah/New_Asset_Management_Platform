using System.Text.Json;
using System.Text.Json.Serialization;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Hosting;
using Inventra.BuildingBlocks.Messaging;
using Inventra.Assets.Api;
using Inventra.Assets.Data;
using Inventra.Contracts.Assets;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInventraAuthentication();
builder.AddTenantDatabase<AssetsDbContext>("assetsdb");
builder.AddInventraMessaging("assets", "assetsdb", typeof(Program).Assembly, publishesNamespaceOf: typeof(ClientAssetsCounted), subscribesTo: ["catalog", "tenancy", "access"]);
builder.AddClientAccess("assets");
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)));

var app = builder.Build();

await app.MigrateIfConfiguredAsync<AssetsDbContext>();
await app.EnsureRowSecurityAppliesAsync<AssetsDbContext>();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapDefaultEndpoints();
app.MapGroup("/").RequireClientAccess().MapAssetEndpoints();

app.Run();

public partial class Program;
