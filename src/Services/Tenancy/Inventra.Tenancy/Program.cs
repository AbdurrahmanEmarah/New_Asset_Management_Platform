using System.Text.Json.Serialization;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Hosting;
using Inventra.BuildingBlocks.Messaging;
using Inventra.Contracts.Tenancy;
using Inventra.Tenancy.Api;
using Inventra.Tenancy.Data;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInventraAuthentication();
builder.AddServiceDatabase<TenancyDbContext>("tenancydb");
builder.AddInventraMessaging("tenancy", "tenancydb", typeof(Program).Assembly, publishesNamespaceOf: typeof(ClientCreated), subscribesTo: ["access"]);
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

await app.MigrateIfConfiguredAsync<TenancyDbContext>();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapDefaultEndpoints();
app.MapClientEndpoints();
app.MapPlatformEndpoints();

app.Run();

public partial class Program;
