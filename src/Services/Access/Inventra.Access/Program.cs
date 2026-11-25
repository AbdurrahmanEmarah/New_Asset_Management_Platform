using System.Text.Json;
using System.Text.Json.Serialization;
using Inventra.Access.Api;
using Inventra.Access.Data;
using Inventra.Access.Identity;
using Inventra.BuildingBlocks.Auth;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Hosting;
using Inventra.BuildingBlocks.Messaging;
using Inventra.Contracts.Access;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddInventraAuthentication();
builder.AddTenantDatabase<AccessDbContext>("accessdb");
builder.AddInventraMessaging("access", "accessdb", typeof(Program).Assembly,
    publishesNamespaceOf: typeof(ClientUsersCounted), subscribesTo: ["tenancy"]);

builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)));
builder.Services.Configure<AccessOptions>(builder.Configuration.GetSection(AccessOptions.Section));
builder.Services.AddScoped<Caller>();

builder.Services.Configure<KeycloakOptions>(builder.Configuration.GetSection(KeycloakOptions.Section));
if (builder.Configuration.GetSection(KeycloakOptions.Section).Get<KeycloakOptions>() is { IsConfigured: true })
    builder.Services.AddHttpClient<IIdentityDirectory, KeycloakIdentityDirectory>();
else
    builder.Services.AddSingleton<IIdentityDirectory, UnconfiguredIdentityDirectory>();

var app = builder.Build();

await app.MigrateIfConfiguredAsync<AccessDbContext>();
await app.EnsureRowSecurityAppliesAsync<AccessDbContext>();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi().AllowAnonymous();
app.MapDefaultEndpoints();

// Members of a client (and platform staff with a support pass).
app.MapGroup("/").RequireClientAccess()
    .MapMeEndpoints()
    .MapRoleEndpoints()
    .MapUserEndpoints()
    .MapSiteEndpoints()
    .MapAuditEndpoints()
    .MapSupportEndpoints();

// Joining a company, and the admin console's client pages.
app.MapInvitationEndpoints();
app.MapPlatformEndpoints();

app.Run();

public partial class Program;
