// Service Bus namespace for integration events (the services' Wolverine outbox publishes here).
// Standard tier (about $10/month base, plus about $0.80 per million operations above the first 13 million):
// topics and subscriptions. Basic has queues only. Private endpoints need Premium (about $680/month per
// messaging unit), so for staging the namespace stays public but allows Entra ID only: local (SAS key)
// auth is off and every app uses its managed identity.
//
// Topology (matches BuildingBlocks.Messaging): each service publishes to topic "inventra.<service>.events";
// each subscriber listens on a subscription named after itself on every topic it subscribes to.
// The apps only send and receive (Data Sender/Receiver), so they can't create these: Bicep does,
// and Messaging:AutoProvision stays off in Azure.

param location string
param name string
param tags object

@description('services.json entries: { name, subscribesTo: [publisher, ...] }.')
param services array

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

resource topics 'Microsoft.ServiceBus/namespaces/topics@2024-01-01' = [
  for s in services: {
    parent: namespace
    name: 'inventra.${s.name}.events'
    properties: {
      defaultMessageTimeToLive: 'P14D'
      maxSizeInMegabytes: 1024
    }
  }
]

var subscriptions = flatten(map(services, s => map(s.subscribesTo, publisher => {
  topic: 'inventra.${publisher}.events'
  subscriber: s.name
})))

resource subs 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2024-01-01' = [
  for sub in subscriptions: {
    name: '${namespace.name}/${sub.topic}/${sub.subscriber}'
    properties: {
      // Wolverine retries and dead-letters in its own tables; this is the broker's safety net.
      maxDeliveryCount: 10
      lockDuration: 'PT1M'
      deadLetteringOnMessageExpiration: true
    }
    dependsOn: [topics]
  }
]

output name string = namespace.name
output fullyQualifiedNamespace string = split(replace(namespace.properties.serviceBusEndpoint, 'https://', ''), ':')[0]
