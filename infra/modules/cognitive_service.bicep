// Wrapper module: splits account and deployments into separate modules for clarity
param name string
param location string
param tags object = {}
param kind string
param skuName string = 'S0'
param customSubDomainName string = ''
param deployments array = []
param publicNetworkAccess string = 'Enabled'
param allowProjectManagement bool = kind == 'AIServices' ? true : false
param disableLocalAuth bool = false

module account 'ai_account.bicep' = {
  name: 'account'
  params: {
    name: name
    location: location
    tags: tags
    kind: kind
    skuName: skuName
    customSubDomainName: customSubDomainName
    publicNetworkAccess: publicNetworkAccess
    allowProjectManagement: allowProjectManagement
    disableLocalAuth: disableLocalAuth
  }
}

module deploymentsMod 'ai_deployments.bicep' = {
  name: 'deployments'
  params: {
    accountName: name
    deployments: deployments
  }
  dependsOn: [account]
}

output id string = account.outputs.id
output name string = account.outputs.name
output endpoint string = account.outputs.endpoint
output principalId string = account.outputs.principalId
output tenantId string = account.outputs.tenantId
output deploymentNames array = length(deployments) > 0 ? deploymentsMod.outputs.deploymentNames : []
output firstDeployment string = length(deployments) > 0 ? deploymentsMod.outputs.firstDeployment : ''
output firstModelVersion string = length(deployments) > 0 ? deploymentsMod.outputs.firstModelVersion : ''
