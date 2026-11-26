using System.Text.Json;
using System.Text.Json.Serialization;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Clients;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Hosting;
using Inventra.BuildingBlocks.Messaging;
using Inventra.Documents.Api;
using Inventra.Documents.Data;
using Inventra.Contracts.Documents;
using Inventra.Documents.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInventraAuthentication();
builder.AddTenantDatabase<DocumentsDbContext>("documentsdb");
builder.AddInventraMessaging("documents", "documentsdb", typeof(Program).Assembly, publishesNamespaceOf: typeof(ClientStorageCounted), subscribesTo: ["tenancy"]);
builder.AddClientAccess("documents");
builder.Services.AddSingleton<IFileStore, BlobFileStore>();
builder.Services.AddHttpClient<IAssetLookup, AssetsServiceLookup>(c => c.BaseAddress = new Uri(builder.Configuration["Services:Assets:Url"] ?? "https+http://assets"));
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)));

var app = builder.Build();

await app.MigrateIfConfiguredAsync<DocumentsDbContext>();
await app.EnsureRowSecurityAppliesAsync<DocumentsDbContext>();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapDefaultEndpoints();
app.MapGroup("/").RequireClientAccess().MapDocumentEndpoints();

app.Run();

public partial class Program;
