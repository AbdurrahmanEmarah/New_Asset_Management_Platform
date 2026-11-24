// Runs the whole platform locally: PostgreSQL, RabbitMQ, Keycloak, the services, the gateway and the web apps.
// Start it with:  dotnet run --project src/AppHost/Inventra.AppHost
// Keycloak listens on a fixed port (default 18080, because 8080 is often taken). Change it with
//   dotnet run --project src/AppHost/Inventra.AppHost -- --AppHost:KeycloakPort=18081

using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

var keycloakPort = builder.Configuration.GetValue("AppHost:KeycloakPort", 18080);
var adminWebPort = builder.Configuration.GetValue("AppHost:AdminWebPort", 5173);
var clientWebPort = builder.Configuration.GetValue("AppHost:ClientWebPort", 5174);

// Local development only: the same value is in realms/inventra.json (client "access-service").
const string accessServiceSecret = "inventra-dev-access-service-secret";

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("inventra-postgres")
    .WithArgs("-c", "max_connections=300");

var tenancyDb = postgres.AddDatabase("tenancydb");
var accessDb = postgres.AddDatabase("accessdb");

// Events between services (outbox in each service's database, delivered through RabbitMQ).
var rabbitmq = builder.AddRabbitMQ("rabbitmq")
    .WithDataVolume("inventra-rabbitmq")
    .WithManagementPlugin();

var keycloak = builder.AddKeycloak("keycloak", keycloakPort)
    .WithDataVolume("inventra-keycloak")
    .WithRealmImport("./realms");

var keycloakUrl = keycloak.GetEndpoint("http");
var platformIssuer = ReferenceExpression.Create($"{keycloakUrl}/realms/inventra-platform");
var tenantIssuer = ReferenceExpression.Create($"{keycloakUrl}/realms/inventra");

var tenancy = builder.AddProject<Projects.Inventra_Tenancy>("tenancy")
    .WithReference(tenancyDb).WaitFor(tenancyDb)
    .WithReference(rabbitmq).WaitFor(rabbitmq)
    .WaitFor(keycloak)
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("Auth__Platform__Authority", platformIssuer)
    .WithEnvironment("Auth__Platform__RequireHttpsMetadata", "false");

var access = builder.AddProject<Projects.Inventra_Access>("access")
    .WithReference(accessDb).WaitFor(accessDb)
    .WithReference(rabbitmq).WaitFor(rabbitmq)
    .WaitFor(keycloak)
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("Auth__Platform__Authority", platformIssuer)
    .WithEnvironment("Auth__Platform__RequireHttpsMetadata", "false")
    .WithEnvironment("Auth__Tenant__Authority", tenantIssuer)
    .WithEnvironment("Auth__Tenant__RequireHttpsMetadata", "false")
    .WithEnvironment("Identity__Keycloak__BaseUrl", keycloakUrl)
    .WithEnvironment("Identity__Keycloak__ClientSecret", accessServiceSecret)
    .WithEnvironment("Access__WebAppUrl", "http://localhost:" + clientWebPort)
    // No email is sent yet: verification is off locally and invitation links are logged.
    .WithEnvironment("Access__RequireVerifiedEmail", "false")
    .WithEnvironment("Access__LogInvitationLinks", "true");

var gateway = builder.AddProject<Projects.Inventra_Gateway>("gateway")
    .WithReference(tenancy).WaitFor(tenancy)
    .WithReference(access).WaitFor(access)
    .WithEnvironment("Auth__Platform__Authority", platformIssuer)
    .WithEnvironment("Auth__Platform__RequireHttpsMetadata", "false")
    .WithEnvironment("Auth__Tenant__Authority", tenantIssuer)
    .WithEnvironment("Auth__Tenant__RequireHttpsMetadata", "false")
    .WithEnvironment("Cors__Origins__0", "http://localhost:" + adminWebPort)
    .WithEnvironment("Cors__Origins__1", "http://localhost:" + clientWebPort)
    // The field app's web build (npx expo start --web).
    .WithEnvironment("Cors__Origins__2", "http://localhost:8081")
    .WithExternalHttpEndpoints();

builder.AddViteApp("admin-web", "../../../web", "dev:admin")
    .WithNpm(install: true)
    .WithEndpoint("http", e => { e.Port = adminWebPort; e.TargetPort = adminWebPort; e.IsProxied = false; })
    .WithEnvironment("VITE_API_URL", gateway.GetEndpoint("http"))
    .WithEnvironment("VITE_OIDC_AUTHORITY", platformIssuer)
    .WithEnvironment("VITE_OIDC_CLIENT_ID", "admin-console")
    .WaitFor(gateway)
    .WithExternalHttpEndpoints();

builder.AddViteApp("client-web", "../../../web", "dev:client")
    .WithNpm(install: true)
    .WithEndpoint("http", e => { e.Port = clientWebPort; e.TargetPort = clientWebPort; e.IsProxied = false; })
    .WithEnvironment("VITE_API_URL", gateway.GetEndpoint("http"))
    .WithEnvironment("VITE_OIDC_AUTHORITY", tenantIssuer)
    .WithEnvironment("VITE_OIDC_CLIENT_ID", "web-app")
    .WaitFor(gateway)
    .WithExternalHttpEndpoints();

builder.Build().Run();
