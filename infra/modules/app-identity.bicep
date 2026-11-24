// A user-assigned managed identity for one app or job, with only the access it needs:
// pull from the registry, read named Key Vault secrets, and optionally Service Bus and Blob Storage.

param location string
param name string
param tags object
param registryName string
param keyVaultName string

@description('Names of the Key Vault secrets this identity may read. Each gets its own secret-scoped role assignment.')
param secretNames array

param serviceBusNamespaceName string = ''
param storageAccountName string = ''

var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  serviceBusDataSender: '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39'
  serviceBusDataReceiver: '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: registryName
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource vaultSecrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = [
  for secretName in secretNames: {
    parent: vault
    name: secretName
  }
]

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, roles.acrPull)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource secretReaders 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for (secretName, i) in secretNames: {
    scope: vaultSecrets[i]
    name: guid(vaultSecrets[i].id, identity.id, roles.keyVaultSecretsUser)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
      principalId: identity.properties.principalId
      principalType: 'ServicePrincipal'
    }
  }
]

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = if (!empty(serviceBusNamespaceName)) {
  name: serviceBusNamespaceName
}

resource busRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for role in (empty(serviceBusNamespaceName) ? [] : [roles.serviceBusDataSender, roles.serviceBusDataReceiver]): {
    scope: serviceBus
    name: guid(serviceBus.id, identity.id, role)
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
      principalId: identity.properties.principalId
      principalType: 'ServicePrincipal'
    }
  }
]

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = if (!empty(storageAccountName)) {
  name: storageAccountName
}

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(storageAccountName)) {
  scope: storage
  name: guid(storage.id, identity.id, roles.storageBlobDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataContributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output id string = identity.id
output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
// Lets callers wait until every role assignment exists.
output roleAssignmentCount int = 1 + length(secretReaders) + length(busRoles) + (empty(storageAccountName) ? 0 : 1)
