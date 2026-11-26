// Azure Static Web Apps (Free), one per single-page web app. Free: 100 GB bandwidth/month, 2 custom domains,
// global CDN, free TLS, $0. The site serves static files only; it calls the gateway for data.
// The deploy workflow uploads the built files with a deployment token read through ARM at deploy time,
// so no token is stored in GitHub. Routing (SPA fallback, headers) comes from staticwebapp.config.json,
// which scripts/web/build-site.sh copies into the build output.

@description('Static Web Apps is only offered in some regions: westeurope, centralus, eastus2, westus2, eastasia.')
param location string
param namePrefix string
param tags object

@description('Web app names, e.g. ["admin", "client"]. Each becomes <namePrefix>-web-<name>.')
param apps array

resource sites 'Microsoft.Web/staticSites@2024-04-01' = [
  for app in apps: {
    name: '${namePrefix}-web-${app}'
    location: location
    tags: tags
    sku: { name: 'Free', tier: 'Free' }
    properties: {
      provider: 'None' // Deployed by our workflow, not linked to the repository by Azure.
      allowConfigFileUpdates: true
      stagingEnvironmentPolicy: 'Disabled'
    }
  }
]

output sites array = [
  for (app, i) in apps: {
    name: app
    siteName: sites[i].name
    url: 'https://${sites[i].properties.defaultHostname}'
  }
]
