// Log Analytics + workspace-based Application Insights.
// Staging: pay-as-you-go (about $2.30-2.80 per GB ingested; the first 5 GB/month per billing account are free),
// 30-day retention (included) and a daily ingestion cap so a log storm can't run up the bill.

param location string
param namePrefix string
param tags object

@description('Daily ingestion cap in GB. -1 means no cap (production).')
param dailyQuotaGb int

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: dailyQuotaGb }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    DisableLocalAuth: false // The Container Apps OpenTelemetry agent sends with the connection string.
  }
}

output workspaceName string = workspace.name
output appInsightsName string = appInsights.name
