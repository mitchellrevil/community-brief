param accountName string
param deployments array = []

resource accountExisting 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: accountName
}

@batchSize(1)
resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = [for dep in deployments: {
  parent: accountExisting
  name: dep.name
  sku: {
    name: dep.?skuName ?? 'Standard'
    capacity: dep.?capacity
  }
  properties: {
    model: {
      format: dep.?format ?? 'OpenAI'
      name: dep.?modelName
      version: dep.?modelVersion
    }
    raiPolicyName: dep.?raiPolicyName
  }
}]

output deploymentNames array = [for d in deployments: d.name]
output firstDeployment string = length(deployments) > 0 ? deployments[0].name : ''
output firstModelVersion string = length(deployments) > 0 ? (deployments[0].modelVersion) : ''
