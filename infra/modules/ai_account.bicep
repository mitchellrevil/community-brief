param name string
param location string
param tags object = {}
param kind string
param skuName string = 'S0'
param customSubDomainName string = ''
param publicNetworkAccess string = 'Enabled'
param allowProjectManagement bool = false
param disableLocalAuth bool = false
param networkAcls object = {
  defaultAction: 'Allow'
}

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: name
  location: location
  tags: tags
  kind: kind
  sku: {
    name: skuName
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: allowProjectManagement
    customSubDomainName: empty(customSubDomainName) ? name : customSubDomainName
    disableLocalAuth: disableLocalAuth
    publicNetworkAccess: publicNetworkAccess
    networkAcls: networkAcls
  }
}

output id string = account.id
output name string = account.name
output endpoint string = account.properties.endpoint
output principalId string = account.identity.principalId
output tenantId string = account.identity.tenantId
