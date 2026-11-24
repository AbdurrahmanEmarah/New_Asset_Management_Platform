// Runs the whole platform locally: PostgreSQL, Keycloak, the services, the gateway and the web apps.
// Start it with:  dotnet run --project src/AppHost/Inventra.AppHost
// Keycloak listens on a fixed port (default 18080, because 8080 is often taken). Change it with
//   dotnet run --project src/AppHost/Inventra.AppHost -- --AppHost:KeycloakPort=18081

using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

var keycloakPort = builder.Configuration.GetValue("AppHost:KeycloakPort", 18080);
var adminWebPort = builder.Configuration.GetValue("AppHost:AdminWebPort", 5173);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("inventra-postgres")
    .WithArgs("-c", "max_connections=300");

var tenancyDb = postgres.AddDatabase("tenancydb");

var keycloak = builder.AddKeycloak("keycloak", keycloakPort)
    .WithDataVolume("inventra-keycloak")
    .WithRealmImport("./realms");

var keycloakUrl = keycloak.GetEndpoint("http");
var platformIssuer = ReferenceExpression.Create($"{keycloakUrl}/realms/inventra-platform");

var tenancy = builder.AddProject<Projects.Inventra_Tenancy>("tenancy")
    .WithReference(tenancyDb).WaitFor(tenancyDb)
    .WaitFor(keycloak)
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("Auth__Platform__Authority", platformIssuer)
    .WithEnvironment("Auth__Platform__RequireHttpsMetadata", "false");

var gateway = builder.AddProject<Projects.Inventra_Gateway>("gateway")
    .WithReference(tenancy).WaitFor(tenancy)
    .WithEnvironment("Auth__Platform__Authority", platformIssuer)
    .WithEnvironment("Auth__Platform__RequireHttpsMetadata", "false")
    .WithEnvironment("Cors__Origins__0", "http://localhost:" + adminWebPort)
    .WithExternalHttpEndpoints();

builder.AddViteApp("admin-web", "../../../web", "dev:admin")
    .WithNpm(install: true)
    .WithEndpoint("http", e => { e.Port = adminWebPort; e.TargetPort = adminWebPort; e.IsProxied = false; })
    .WithEnvironment("VITE_API_URL", gateway.GetEndpoint("http"))
    .WithEnvironment("VITE_OIDC_AUTHORITY", platformIssuer)
    .WithEnvironment("VITE_OIDC_CLIENT_ID", "admin-console")
    .WaitFor(gateway)
    .WithExternalHttpEndpoints();

builder.Build().Run();
