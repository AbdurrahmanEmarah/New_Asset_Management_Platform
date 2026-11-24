// Service Bus namespace for integration events (the services' outbox publishes here).
// Standard tier (about $10/month base): topics and subscriptions. Basic has queues only. Private endpoints
// need Premium (about $680/month per messaging unit), so for staging the namespace stays public but
// allows Entra ID only: local (SAS key) auth is off and every app uses its managed identity.
// Topics and subscriptions are added when the Access service's messaging lands.

param location string
param name string
param tags object

resource namespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: name
  location: location
  tags: tags
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {
    disableLocalAuth: true
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

output name string = namespace.name
output fullyQualifiedNamespace string = split(replace(namespace.properties.serviceBusEndpoint, 'https://', ''), ':')[0]
