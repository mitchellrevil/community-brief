param cosmosAccountName string
param principalIds array = []

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2025-05-01-preview' existing = {
  name: cosmosAccountName
}

var builtInDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource dataContributorAssignments 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-05-01-preview' = [for principalId in principalIds: {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, principalId, builtInDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${builtInDataContributorRoleId}'
    principalId: principalId
    scope: cosmosAccount.id
  }
}]

output builtInDataContributorRoleId string = builtInDataContributorRoleId
