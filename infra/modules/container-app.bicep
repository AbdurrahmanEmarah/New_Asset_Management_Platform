// One Container App (the gateway or a service). .NET images listen on 8080 and run as a non-root user.
// Probes use the chassis endpoints: /alive (process only) for liveness, /health (includes the database)
// for readiness.

param location string
param name string
param tags object
param environmentId string
param identityId string
param registryServer string
param image string

@description('True only for the gateway: it gets a public HTTPS address. Services are reachable inside the environment only.')
param external bool

@description('Environment variables: { name, value } or { name, secretRef }.')
param env array

@description('Key Vault secret references: { name, keyVaultUrl }. Read with the app identity.')
param keyVaultSecrets array = []

param minReplicas int
param maxReplicas int
param cpu string = '0.25'
param memory string = '0.5Gi'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: external
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        { server: registryServer, identity: identityId }
      ]
      secrets: [
        for s in keyVaultSecrets: {
          name: s.name
          keyVaultUrl: s.keyVaultUrl
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: image
          resources: { cpu: json(cpu), memory: memory }
          env: env
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/alive', port: 8080 }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 8080 }
              initialDelaySeconds: 5
              periodSeconds: 15
              failureThreshold: 4
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '50' } } }
        ]
      }
    }
  }
}

output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
