// Staging parameters. Values come from environment variables, which the deploy workflow sets from the
// repository's variables (see docs/deployment/azure-setup.md). Nothing secret is stored here.
using './main.bicep'

param namePrefix = readEnvironmentVariable('INVENTRA_NAME_PREFIX', 'inventra')
param envName = 'staging'
param location = readEnvironmentVariable('INVENTRA_LOCATION', 'westeurope')

param imageTag = readEnvironmentVariable('INVENTRA_IMAGE_TAG', '')
param deployJobs = bool(readEnvironmentVariable('INVENTRA_DEPLOY_JOBS', 'false'))
param deployApps = bool(readEnvironmentVariable('INVENTRA_DEPLOY_APPS', 'false'))

param platformAuthority = readEnvironmentVariable('INVENTRA_PLATFORM_AUTHORITY', '')
param tenantAuthority = readEnvironmentVariable('INVENTRA_TENANT_AUTHORITY', '')
param platformAudience = readEnvironmentVariable('INVENTRA_PLATFORM_AUDIENCE', 'inventra-api')
param tenantAudience = readEnvironmentVariable('INVENTRA_TENANT_AUDIENCE', 'inventra-api')
// Comma-separated, e.g. "https://admin.example.com,https://app.example.com".
param corsOrigins = map(filter(split(readEnvironmentVariable('INVENTRA_CORS_ORIGINS', ''), ','), o => !empty(trim(o))), o => trim(o))

// Written by scripts/deploy/new-secrets.sh for the first run only. JSON object of { secretName: value }.
param newSecrets = json(readEnvironmentVariable('INVENTRA_NEW_SECRETS', '{}'))
