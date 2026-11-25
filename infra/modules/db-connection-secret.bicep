// Writes a service's runtime connection string to Key Vault, so the app reads one secret and the password
// never appears in app settings.

param keyVaultName string
param secretName string
param host string
param database string
param username string

@secure()
param password string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: secretName
  properties: {
    contentType: 'Npgsql connection string'
    value: 'Host=${host};Database=${database};Username=${username};Password=${password};SSL Mode=Require'
  }
}

output name string = secret.name
