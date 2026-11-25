// Azure Container Registry for the service images.
// Basic SKU (about $5/month, 10 GB). Private endpoints need Premium (about $50/month), so the registry
// stays public but has no admin user and no anonymous pull: pushes use the deploy identity (AcrPush),
// pulls use each app's managed identity (AcrPull).

param location string
param name string
param tags object

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// The identity running the deployment pushes images.
resource deployerPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployer().objectId, 'AcrPush')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
    principalId: deployer().objectId
  }
}

output name string = registry.name
output loginServer string = registry.properties.loginServer
