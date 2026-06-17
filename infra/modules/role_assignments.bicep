// Azure RBAC role assignments for managed identity access to Storage and AI services

param principalIds array = []
param storageAccountName string
param aiAccountName string = ''
param speechAccountName string = ''
param keyVaultName string = ''
param assignStorageRoles bool = true
param assignAIRoles bool = true
param assignSpeechRoles bool = false
param assignKeyVaultSecretsUser bool = false

// Reference existing storage account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = if (assignStorageRoles) {
  name: storageAccountName
}

resource aiAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = if (assignAIRoles && !empty(aiAccountName)) {
  name: aiAccountName
}

resource speechAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = if (assignSpeechRoles && !empty(speechAccountName)) {
  name: speechAccountName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = if (assignKeyVaultSecretsUser && !empty(keyVaultName)) {
  name: keyVaultName
}

// Built-in Azure RBAC Role Definition IDs
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var cognitiveServicesSpeechContributorRoleId = '0e75ca1e-0464-4b4d-8b93-68208a576181'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// Assign Storage Blob Data Contributor role
resource storageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (principalId, i) in principalIds: if (assignStorageRoles) {
  name: guid(storageAccount.id, principalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

// Assign Storage Queue Data Contributor role so identities can access Storage Queues
resource storageQueueRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (principalId, i) in principalIds: if (assignStorageRoles) {
  name: guid(storageAccount.id, principalId, storageQueueDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

resource storageTableRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in principalIds: if (assignStorageRoles) {
  name: guid(storageAccount.id, principalId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

resource aiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in principalIds: if (assignAIRoles && !empty(aiAccountName)) {
  name: guid(aiAccount.id, principalId, cognitiveServicesUserRoleId)
  scope: aiAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

resource speechRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (principalId, i) in principalIds: if (assignSpeechRoles && !empty(speechAccountName)) {
  name: guid(speechAccount.id, principalId, cognitiveServicesSpeechContributorRoleId)
  scope: speechAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesSpeechContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in principalIds: if (assignKeyVaultSecretsUser && !empty(keyVaultName)) {
  name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]


