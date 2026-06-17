param name string
param location string
param tags object = {}
param skuName string = 'Standard'
param backendResourceId string = ''
param backendRegion string = ''

resource swa 'Microsoft.Web/staticSites@2022-09-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName
  }
  properties: {
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// Link backend API if provided
resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2025-03-01' = if (!empty(backendResourceId)) {
  parent: swa
  name: 'backend'
  properties: {
    backendResourceId: backendResourceId
    region: !empty(backendRegion) ? backendRegion : location
  }
}

output id string = swa.id
output name string = swa.name
output defaultHostname string = swa.properties.defaultHostname

