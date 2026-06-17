param projectName string
param foundryName string
param location string
param tags object = {}

// Reference existing AI Foundry resource
resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryName
}

/*
  Developer APIs are exposed via a project, which groups in- and outputs that relate to one use case, including files.
  Its advisable to create one project right away, so development teams can directly get started.
  Projects may be granted individual RBAC permissions and identities on top of what account provides.
*/ 
resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  name: projectName
  parent: aiFoundry
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

output id string = aiProject.id
output name string = aiProject.name
output principalId string = aiProject.identity.principalId
output tenantId string = aiProject.identity.tenantId
// Project endpoints are used for developer APIs (not the account endpoint)
// The endpoints object contains the project's API endpoints
output endpoints object = aiProject.properties.endpoints
// Helper to pick a sensible default endpoint for discovery: prefer 'default', fall back to 'api'
output defaultEndpoint string = aiProject.properties.endpoints.?default ?? aiProject.properties.endpoints.?api ?? ''

