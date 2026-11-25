// Blob Storage for documents and photos (Documents service, phase 2).
// Standard LRS, hot tier: about $0.02 per GB/month plus operations, so cents while empty. Production: ZRS.
// No shared keys, no public blobs, and no public network: only the private endpoint.

param location string
param name string
param tags object
param privateEndpointSubnetId string
param privateDnsZoneId string
param skuName string

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: skuName }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    networkAcls: { defaultAction: 'Deny', bypass: 'None' }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

module endpoint 'private-endpoint.bicep' = {
  name: '${name}-blob-pe'
  params: {
    location: location
    name: '${name}-blob-pe'
    tags: tags
    subnetId: privateEndpointSubnetId
    targetResourceId: account.id
    groupId: 'blob'
    privateDnsZoneId: privateDnsZoneId
  }
}

output name string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
