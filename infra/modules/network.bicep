// VNet with three subnets:
//   apps              Container Apps environment (workload profiles, delegated)
//   postgres          PostgreSQL Flexible Server private access (delegated)
//   private-endpoints Key Vault and Blob Storage private endpoints
// Plus the private DNS zones those need, linked to the VNet.
// A VNet, subnets and DNS links cost nothing; each private DNS zone is about $0.50/month.

param location string
param namePrefix string
param tags object

@description('Address space of the VNet. Must not overlap any network you might peer with later.')
param addressPrefix string = '10.40.0.0/16'

var vnetName = '${namePrefix}-vnet'

resource appsNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${namePrefix}-apps-nsg'
  location: location
  tags: tags
}

resource dataNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${namePrefix}-data-nsg'
  location: location
  tags: tags
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [addressPrefix] }
    subnets: [
      {
        name: 'apps'
        properties: {
          // Workload-profile environments need at least /27; /23 leaves room to grow.
          addressPrefix: cidrSubnet(addressPrefix, 23, 0) // 10.40.0.0/23
          networkSecurityGroup: { id: appsNsg.id }
          delegations: [
            { name: 'containerapps', properties: { serviceName: 'Microsoft.App/environments' } }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: cidrSubnet(addressPrefix, 28, 32) // 10.40.2.0/28
          networkSecurityGroup: { id: dataNsg.id }
          delegations: [
            { name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: cidrSubnet(addressPrefix, 27, 24) // 10.40.3.0/27
          networkSecurityGroup: { id: dataNsg.id }
          privateEndpointNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

var zoneNames = {
  keyVault: 'privatelink.vaultcore.azure.net'
  blob: 'privatelink.blob.${az.environment().suffixes.storage}'
  postgres: 'private.postgres.database.azure.com'
}

resource zones 'Microsoft.Network/privateDnsZones@2024-06-01' = [
  for zone in items(zoneNames): {
    name: zone.value
    location: 'global'
    tags: tags
  }
]

resource zoneLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [
  for (zone, i) in items(zoneNames): {
    parent: zones[i]
    name: '${vnetName}-link'
    location: 'global'
    tags: tags
    properties: {
      registrationEnabled: false
      virtualNetwork: { id: vnet.id }
    }
  }
]

output vnetId string = vnet.id
output appsSubnetId string = vnet.properties.subnets[0].id
output postgresSubnetId string = vnet.properties.subnets[1].id
output privateEndpointSubnetId string = vnet.properties.subnets[2].id
// items() sorts keys alphabetically: blob, keyVault, postgres.
output blobZoneId string = zones[0].id
output keyVaultZoneId string = zones[1].id
output postgresZoneId string = zones[2].id
