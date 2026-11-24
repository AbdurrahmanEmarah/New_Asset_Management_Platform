// PostgreSQL Flexible Server with private access (VNet integration, no public endpoint) and one database
// per service.
// Staging: Burstable B1ms (1 vCore, 2 GiB, about $13/month) + 32 GiB storage (about $4/month), 7-day
// backups, no high availability. Production: General Purpose D2ds_v5 or larger, zone-redundant HA,
// longer backups and geo-redundant backup.
// B1ms allows about 50 user connections, so services keep Database:MaxPoolSize small (default 10).

param location string
param name string
param tags object
param subnetId string
param privateDnsZoneId string
param administratorLogin string

@secure()
param administratorPassword string

param databases array
param skuName string
param skuTier string
param storageSizeGB int
param postgresVersion string
param highAvailability bool

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  tags: tags
  sku: { name: skuName, tier: skuTier }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    authConfig: {
      // Services sign in with their own svc_<service> password logins (see docs/deployment/database-logins.md).
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
    storage: { storageSizeGB: storageSizeGB, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: highAvailability ? 'ZoneRedundant' : 'Disabled' }
    network: {
      delegatedSubnetResourceId: subnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
  }
}

// Only TLS connections (the default, stated here so nobody turns it off by accident).
resource secureTransport 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'require_secure_transport'
  properties: { value: 'on', source: 'user-override' }
}

@batchSize(1) // The server accepts one change at a time.
resource dbs 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = [
  for db in databases: {
    parent: server
    name: db
    properties: { charset: 'UTF8', collation: 'en_US.utf8' }
    dependsOn: [secureTransport]
  }
]

output name string = server.name
output fqdn string = server.properties.fullyQualifiedDomainName
