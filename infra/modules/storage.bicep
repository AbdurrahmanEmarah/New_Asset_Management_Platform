// Blob Storage for documents and photos (Documents service), container "documents".
// Standard LRS, hot tier: about $0.02 per GB/month plus operations, so cents while empty. Production: ZRS.
//
// Access: no account keys (shared key auth is off), no anonymous blobs. The Documents service reads and
// writes through the private endpoint with its managed identity (Storage Blob Data Contributor, which
// also lets it get a user delegation key). Browsers download through short-lived *user delegation* SAS
// links, which reach the account over its public endpoint: so the public endpoint is open to the
// internet but accepts only Entra tokens and user delegation SAS, never an account key or anonymous read.

param location string
param name string
param tags object
param privateEndpointSubnetId string
param privateDnsZoneId string
param skuName string

@description('Blob container the Documents service uses (Blob:Container).')
param containerName string = 'documents'

@description('Browser origins allowed to fetch download links with JavaScript (the web apps).')
param corsOrigins array = []

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
    // Open for SAS download links (see above). Set to 'Disabled' if downloads ever go through the service.
    publicNetworkAccess: 'Enabled'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
    cors: {
      corsRules: empty(corsOrigins) ? [] : [
        {
          allowedOrigins: corsOrigins
          allowedMethods: ['GET', 'HEAD']
          allowedHeaders: ['*']
          exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type', 'ETag']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: { publicAccess: 'None' }
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
output containerName string = container.name
