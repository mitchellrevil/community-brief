param name string
param location string
param tags object = {}

@secure()
param jwtSecretKey string

@secure()
param microsoftClientId string

@secure()
param microsoftTenantId string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource jwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'jwt-secret-key'
  properties: {
    value: jwtSecretKey
  }
}

resource microsoftClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'microsoft-client-id'
  properties: {
    value: microsoftClientId
  }
}

resource microsoftTenantIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'microsoft-tenant-id'
  properties: {
    value: microsoftTenantId
  }
}

output id string = vault.id
output name string = vault.name
output secretUris object = {
  jwtSecretKey: jwtSecret.properties.secretUri
  microsoftClientId: microsoftClientIdSecret.properties.secretUri
  microsoftTenantId: microsoftTenantIdSecret.properties.secretUri
}
