// A manually started Container Apps job that runs the db-tools image (infra/db): either the one-off role
// bootstrap (as the PostgreSQL admin) or one service's migrations (as that service's migrator login).
// Jobs cost only while they run (seconds per deployment).

param location string
param name string
param tags object
param environmentId string
param identityId string
param registryServer string
param image string

@description('Arguments for /app/entrypoint.sh, e.g. ["bootstrap"] or ["migrate", "tenancy"].')
param args array

param env array
param keyVaultSecrets array

resource job 'Microsoft.App/jobs@2024-03-01' = {
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
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
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
          name: 'db-tools'
          image: image
          args: args
          env: env
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
    }
  }
}

output name string = job.name
