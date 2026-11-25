// Container Apps environment on the VNet, Consumption workload profile only.
// The environment costs nothing by itself; apps pay per vCPU-second and GiB-second above the monthly free
// grant (180,000 vCPU-s and 360,000 GiB-s per subscription). Staging apps scale to zero when idle.
// The managed OpenTelemetry agent receives the services' OTLP output (it sets OTEL_EXPORTER_OTLP_ENDPOINT
// in every app) and forwards traces and logs to Application Insights.

param location string
param namePrefix string
param tags object
param subnetId string
param workspaceName string
param appInsightsName string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

// A preview API version, because the OpenTelemetry agent (appInsightsConfiguration, openTelemetryConfiguration)
// isn't in a generally available version yet.
resource env 'Microsoft.App/managedEnvironments@2025-02-02-preview' = {
  name: '${namePrefix}-cae'
  location: location
  tags: tags
  properties: {
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
    vnetConfiguration: {
      infrastructureSubnetId: subnetId
      internal: false // The gateway has a public HTTPS endpoint; every other app is internal-only.
    }
    zoneRedundant: false // Production: true (needs the subnet to be created zone-redundant from the start).
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    appInsightsConfiguration: {
      connectionString: appInsights.properties.ConnectionString
    }
    openTelemetryConfiguration: {
      tracesConfiguration: { destinations: ['appInsights'] }
      logsConfiguration: { destinations: ['appInsights'] }
    }
  }
}

output id string = env.id
output name string = env.name
output defaultDomain string = env.properties.defaultDomain
