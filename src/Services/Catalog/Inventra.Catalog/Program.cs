using System.Text.Json;
using System.Text.Json.Serialization;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Hosting;
using Inventra.BuildingBlocks.Messaging;
using Inventra.Catalog.Api;
using Inventra.Catalog.Data;
using Inventra.Contracts.Catalog;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInventraAuthentication();
builder.AddTenantDatabase<CatalogDbContext>("catalogdb");
builder.AddInventraMessaging("catalog", "catalogdb", typeof(Program).Assembly, publishesNamespaceOf: typeof(AssetTypePublished), subscribesTo: []);
builder.AddClientAccess("catalog");
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)));

var app = builder.Build();

await app.MigrateIfConfiguredAsync<CatalogDbContext>();
await app.EnsureRowSecurityAppliesAsync<CatalogDbContext>();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapDefaultEndpoints();
app.MapGroup("/").RequireClientAccess().MapTypeEndpoints();
app.MapPlatformTemplateEndpoints();

app.Run();

public partial class Program;
