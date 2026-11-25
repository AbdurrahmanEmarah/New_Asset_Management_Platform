// One private endpoint plus its DNS registration. About $7.30/month each, plus data processed.

param location string
param name string
param tags object
param subnetId string
param targetResourceId string
param groupId string
param privateDnsZoneId string

resource endpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: name
        properties: {
          privateLinkServiceId: targetResourceId
          groupIds: [groupId]
        }
      }
    ]
  }
}

resource dns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: endpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      { name: groupId, properties: { privateDnsZoneId: privateDnsZoneId } }
    ]
  }
}
