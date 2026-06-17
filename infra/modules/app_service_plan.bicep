param name string
param location string
param tags object = {}
param skuName string = 'B2'
param skuTier string = 'Basic'
param kind string = 'linux'
param reserved bool = true

resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  kind: kind
  properties: {
    reserved: reserved
  }
}

output id string = plan.id
output name string = plan.name
