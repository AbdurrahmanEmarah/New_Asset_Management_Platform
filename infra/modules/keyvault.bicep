// Key Vault (Standard, about $0.03 per 10,000 operations: cents per month) with RBAC, a private endpoint
// and no public access except Azure's trusted services.
// Secret values never pass through the repo: the deploy workflow generates missing passwords
// (scripts/deploy/new-secrets.sh) and hands them in once through the secure "newSecrets" parameter.

param location string
param name string
param tags object
param privateEndpointSubnetId string
param privateDnsZoneId string

@description('Days a deleted vault or secret can be recovered. Staging: 7. Production: 90.')
param softDeleteRetentionInDays int

@description('Production should set this to true. It cannot be turned off again.')
param enablePurgeProtection bool

@secure()
@description('Secrets to create or replace, as { name: value }. Empty on normal runs.')
param newSecrets object

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    // Lets ARM read secrets for this deployment (getSecret() in main.bicep). Needs vaults/deploy/action,
    // which Contributor on the resource group includes.
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enablePurgeProtection: enablePurgeProtection ? true : null
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      // Only the private endpoint and Azure's trusted services (ARM template deployment, Container Apps
      // secret references) get in; no public IP is allowed.
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource secrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [
  for secret in items(newSecrets): {
    parent: vault
    name: secret.key
    properties: { value: secret.value }
  }
]

module endpoint 'private-endpoint.bicep' = {
  name: '${name}-pe'
  params: {
    location: location
    name: '${name}-pe'
    tags: tags
    subnetId: privateEndpointSubnetId
    targetResourceId: vault.id
    groupId: 'vault'
    privateDnsZoneId: privateDnsZoneId
  }
}

output name string = vault.name
output uri string = vault.properties.vaultUri
// Lets callers wait for the new secrets before reading them with getSecret().
output secretCount int = length(secrets)
