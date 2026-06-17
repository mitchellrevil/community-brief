targetScope = 'subscription'

param environment string = 'dev'
param location string = 'uksouth'
param corsOrigins string = ''
param aiRegion string = 'swedencentral'

@secure()
param jwtSecretKey string

@secure()
param microsoftClientId string

@secure()
param microsoftTenantId string

var appName = 'community'
var resourceGroupName = 'rg-${environment}-${appName}-${location}'
var tags = {
  app: appName
  environment: environment
}

var recordingsContainerName = 'recordingscontainer'
var transcriptsContainerName = 'transcripts'
var cosmosDatabaseName = 'VoiceDB'
var cosmosDbPrefix = 'voice_'
var aiDeploymentName = 'gpt-5.1'
var azureOpenAiApiVersion = '2024-12-01-preview'
var jwtAlgorithm = 'HS256'
var jwtAccessTokenExpireMinutes = '3000'
var maxUploadSizeMb = '2048'
var enableFastTranscription = 'true'
var fastTranscriptionThresholdMinutes = '120'
var enableReasoning = 'false'
var reasoningLevel = 'medium'
var speechName = 'speech-${environment}-${appName}'
var speechLocation = location
var speechSkuName = 'S0'
var webAppCommandLine = 'python3 -m gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000 --log-level debug'

var envAbbrev = toLower(substring(environment, 0, min(length(environment), 3)))
var appNameAbbrev = toLower(substring(appName, 0, min(length(appName), 6)))
var storageAccountName = 'st${appNameAbbrev}${envAbbrev}${uniqueString(subscription().id, resourceGroupName)}'
var appServicePlanName = 'asp-${environment}-${appName}'
var functionAppName = 'func-${environment}-${appName}-${location}'
var webAppName = 'web-${environment}-${appName}-${location}'
var cosmosDbName = 'cosmos-${environment}-${appName}'
var logAnalyticsName = 'log-${environment}-${appName}-${location}'
var appInsightsName = 'appi-${environment}-${appName}-${location}'
var staticWebAppName = 'swa-${environment}-${appName}-${location}'
var aiAccountName = 'ai-${environment}-${appName}'
var aiProjectName = 'aiproject-${environment}-${appName}'
var keyVaultName = 'kv-${environment}-${appName}-${substring(uniqueString(subscription().id, resourceGroupName), 0, 6)}'
var recordingsContainerUrl = '${storage.outputs.primaryEndpoints.blob}${recordingsContainerName}/'
var functionBaseUrl = 'https://${func.outputs.defaultHostName}'
var speechEndpointValue = speechAccount.outputs.endpoint
var aiEndpointValue = aiAccount.outputs.endpoint
var keyVaultSecretUris = keyVault.outputs.secretUris

var aiDeployments = [
  {
    name: 'gpt-5.1'
    modelName: 'gpt-5.1'
    modelVersion: '2025-11-13'
    skuName: 'DataZoneStandard'
    capacity: 769
  }
  {
    name: 'gpt-5-nano'
    modelName: 'gpt-5-nano'
    modelVersion: '2025-08-07'
    skuName: 'DataZoneStandard'
    capacity: 250
  }
  {
    name: 'gpt-5-mini'
    modelName: 'gpt-5-mini'
    modelVersion: '2025-08-07'
    skuName: 'DataZoneStandard'
    capacity: 250
  }
  {
    name: 'gpt-4.1'
    modelName: 'gpt-4.1'
    modelVersion: '2025-04-14'
    skuName: 'DataZoneStandard'
    capacity: 50
  }
  {
    name: 'gpt-4o'
    modelName: 'gpt-4o'
    modelVersion: '2024-08-06'
    skuName: 'DataZoneStandard'
    capacity: 250
  }
]

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module keyVault 'modules/key_vault.bicep' = {
  name: 'keyVault'
  scope: rg
  params: {
    name: keyVaultName
    location: location
    tags: tags
    jwtSecretKey: jwtSecretKey
    microsoftClientId: microsoftClientId
    microsoftTenantId: microsoftTenantId
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    name: storageAccountName
    location: location
    tags: tags
    containerNames: [
      recordingsContainerName
      transcriptsContainerName
    ]
  }
}

module cosmosDb 'modules/cosmos_db.bicep' = {
  name: 'cosmosDb'
  scope: rg
  params: {
    name: cosmosDbName
    location: location
    tags: tags
    capacityMode: 'Serverless'
    totalThroughputLimit: 4000
    databases: [
      {
        name: cosmosDatabaseName
        containers: [
          {
            name: 'voice_auth'
            partitionKey: {
              paths: ['/id']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/voice_auth_indexing_policy.json')
          }
          {
            name: 'announcements'
            partitionKey: {
              paths: ['/id']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/announcements_indexing_policy.json')
          }
          {
            name: 'voice_audit_logs'
            partitionKey: {
              paths: ['/user_id']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/voice_audit_logs_indexing_policy.json')
          }
          {
            name: 'voice_prompts'
            partitionKey: {
              paths: ['/id']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/voice_prompts_indexing_policy.json')
          }
          {
            name: 'voice_jobs'
            partitionKey: {
              paths: ['/id']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/voice_jobs_indexing_policy.json')
          }
          {
            name: 'voice_user_sessions'
            partitionKey: {
              paths: ['/user_id']
              kind: 'Hash'
              version: 2
            }
            defaultTtl: 2592000
            indexingPolicy: loadJsonContent('indexing_policies/voice_user_sessions_indexing_policy.json')
          }
          {
            name: 'voice_analytics'
            partitionKey: {
              paths: ['/type']
              kind: 'Hash'
              version: 2
            }
            indexingPolicy: loadJsonContent('indexing_policies/voice_analytics_indexing_policy.json')
          }
        ]
      }
    ]
  }
}

module logs 'modules/log_analytics.bicep' = {
  name: 'logs'
  scope: rg
  params: {
    name: logAnalyticsName
    location: location
    tags: tags
  }
}

module insights 'modules/app_insights.bicep' = {
  name: 'appInsights'
  scope: rg
  params: {
    name: appInsightsName
    location: location
    tags: tags
    workspaceId: logs.outputs.id
  }
}

module aiAccount 'modules/ai_account.bicep' = {
  name: 'aiAccount'
  scope: rg
  params: {
    name: aiAccountName
    location: aiRegion
    tags: tags
    kind: 'AIServices'
    skuName: 'S0'
    customSubDomainName: aiAccountName
    allowProjectManagement: true
  }
}

module aiAccountDeployments 'modules/ai_deployments.bicep' = {
  name: 'aiDeployments'
  scope: rg
  params: {
    accountName: aiAccountName
    deployments: aiDeployments
  }
  dependsOn: [
    aiAccount
  ]
}

module aiProject 'modules/ai_project.bicep' = {
  name: 'aiProject'
  scope: rg
  params: {
    projectName: aiProjectName
    foundryName: aiAccountName
    location: aiRegion
  }
  dependsOn: [
    aiAccount
  ]
}

module speechAccount 'modules/ai_account.bicep' = {
  name: 'speechService'
  scope: rg
  params: {
    name: speechName
    location: speechLocation
    tags: tags
    kind: 'SpeechServices'
    skuName: speechSkuName
    customSubDomainName: speechName
  }
}

var webAppSettings = [
  { name: 'AZURE_COSMOS_ENDPOINT', value: cosmosDb.outputs.endpoint }
  { name: 'AZURE_COSMOS_DB', value: cosmosDatabaseName }
  { name: 'AZURE_COSMOS_DB_PREFIX', value: cosmosDbPrefix }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.outputs.primaryEndpoints.blob }
  { name: 'AZURE_STORAGE_RECORDINGS_CONTAINER', value: recordingsContainerName }
  { name: 'AZURE_OPENAI_ENDPOINT', value: aiEndpointValue }
  { name: 'AZURE_OPENAI_DEPLOYMENT', value: aiDeploymentName }
  { name: 'AZURE_OPENAI_DEPLOYMENT_NAME', value: aiDeploymentName }
  { name: 'AZURE_OPENAI_API_VERSION', value: azureOpenAiApiVersion }
  { name: 'AZURE_FUNCTIONS_BASE_URL', value: functionBaseUrl }
  { name: 'AZURE_SPEECH_DEPLOYMENT', value: speechName }
  { name: 'AZURE_SPEECH_ENDPOINT', value: speechEndpointValue }
  { name: 'AZURE_SPEECH_REGION', value: speechLocation }
  { name: 'CORS_ORIGINS', value: corsOrigins }
  { name: 'ENVIRONMENT', value: environment }
  { name: 'JWT_SECRET_KEY', value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.jwtSecretKey})' }
  { name: 'JWT_ALGORITHM', value: jwtAlgorithm }
  { name: 'JWT_ACCESS_TOKEN_EXPIRE_MINUTES', value: jwtAccessTokenExpireMinutes }
  { name: 'MICROSOFT_CLIENT_ID', value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.microsoftClientId})' }
  { name: 'MICROSOFT_TENANT_ID', value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.microsoftTenantId})' }
  { name: 'MAX_UPLOAD_SIZE_MB', value: maxUploadSizeMb }
]

var functionAppSettings = [
  { name: 'AZURE_COSMOS_ENDPOINT', value: cosmosDb.outputs.endpoint }
  { name: 'AZURE_COSMOS_DB', value: cosmosDatabaseName }
  { name: 'AZURE_COSMOS_DB_PREFIX', value: cosmosDbPrefix }
  { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storage.outputs.name }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.outputs.primaryEndpoints.blob }
  { name: 'AZURE_STORAGE_RECORDINGS_CONTAINER', value: recordingsContainerName }
  { name: 'AZURE_STORAGE_RECORDINGS_CONTAINER_URL', value: recordingsContainerUrl }
  { name: 'AZURE_OPENAI_ENDPOINT', value: aiEndpointValue }
  { name: 'AZURE_OPENAI_DEPLOYMENT', value: aiDeploymentName }
  { name: 'AZURE_OPENAI_DEPLOYMENT_NAME', value: aiDeploymentName }
  { name: 'AZURE_OPENAI_API_VERSION', value: azureOpenAiApiVersion }
  { name: 'AZURE_OPENAI_DEFAULT_PROVIDER', value: 'responses' }
  { name: 'ENABLE_FAST_TRANSCRIPTION', value: enableFastTranscription }
  { name: 'FAST_TRANSCRIPTION_THRESHOLD_MINUTES', value: fastTranscriptionThresholdMinutes }
  { name: 'ENABLE_REASONING', value: enableReasoning }
  { name: 'REASONING_LEVEL', value: reasoningLevel }
  { name: 'AZURE_SPEECH_DEPLOYMENT', value: speechName }
  { name: 'AZURE_SPEECH_ENDPOINT', value: speechEndpointValue }
  { name: 'AZURE_SPEECH_REGION', value: speechLocation }
  { name: 'ENVIRONMENT', value: environment }
]

module plan 'modules/app_service_plan.bicep' = {
  name: 'appServicePlan'
  scope: rg
  params: {
    name: appServicePlanName
    location: location
    tags: tags
  }
}

module func 'modules/function_app.bicep' = {
  name: 'functionApp'
  scope: rg
  params: {
    name: functionAppName
    location: location
    tags: tags
    serverFarmId: plan.outputs.id
    storageAccountName: storage.outputs.name
    appInsightsConnectionString: insights.outputs.connectionString
    appSettings: functionAppSettings
  }
}

module web 'modules/web_app.bicep' = {
  name: 'webApp'
  scope: rg
  params: {
    name: webAppName
    location: location
    tags: tags
    serverFarmId: plan.outputs.id
    appInsightsConnectionString: insights.outputs.connectionString
    appSettings: webAppSettings
    appCommandLine: webAppCommandLine
  }
}

module swa 'modules/static_web_app.bicep' = {
  name: 'staticWebApp'
  scope: rg
  params: {
    name: staticWebAppName
    location: 'westeurope'
    tags: tags
    backendResourceId: web.outputs.id
    backendRegion: location
  }
}

module cosmosSqlRoles 'modules/cosmos_sql_roles.bicep' = {
  name: 'cosmosSqlRoles'
  scope: rg
  params: {
    cosmosAccountName: cosmosDb.outputs.name
    principalIds: [
      web.outputs.principalId
      func.outputs.principalId
    ]
  }
}

module webAppRoleAssignments 'modules/role_assignments.bicep' = {
  name: 'webAppRoleAssignments'
  scope: rg
  params: {
    principalIds: [web.outputs.principalId]
    storageAccountName: storage.outputs.name
    keyVaultName: keyVault.outputs.name
    aiAccountName: aiAccount.outputs.name
    assignStorageRoles: true
    assignKeyVaultSecretsUser: true
    assignAIRoles: true
  }
}

module funcAppRoleAssignments 'modules/role_assignments.bicep' = {
  name: 'funcAppRoleAssignments'
  scope: rg
  params: {
    principalIds: [func.outputs.principalId]
    storageAccountName: storage.outputs.name
    keyVaultName: keyVault.outputs.name
    aiAccountName: aiAccount.outputs.name
    speechAccountName: speechAccount.outputs.name
    assignStorageRoles: true
    assignKeyVaultSecretsUser: true
    assignAIRoles: true
    assignSpeechRoles: true
  }
}

output resourceGroupName string = rg.name
output storageAccountName string = storage.outputs.name
output storageBlobEndpoint string = storage.outputs.primaryEndpoints.blob
output storageRecordingsContainerName string = recordingsContainerName
output storageTranscriptsContainerName string = transcriptsContainerName
output storageRecordingsContainerUrl string = recordingsContainerUrl
output storageTranscriptsContainerUrl string = '${storage.outputs.primaryEndpoints.blob}${transcriptsContainerName}/'
output cosmosEndpoint string = cosmosDb.outputs.endpoint
output cosmosAccountName string = cosmosDb.outputs.name
output cosmosDbName string = cosmosDatabaseName
output keyVaultName string = keyVault.outputs.name
output webAppName string = web.outputs.name
output functionAppName string = func.outputs.name
output webAppHostname string = web.outputs.defaultHostName
output functionAppHostname string = func.outputs.defaultHostName
output appServicePlanName string = plan.outputs.name
output appServicePlanId string = plan.outputs.id
output aiRuntimeEndpoint string = aiEndpointValue
output aiRuntimeDeploymentName string = aiDeploymentName
output aiEndpoint string = aiEndpointValue
output aiAccountName string = aiAccountName
output aiApiVersion string = azureOpenAiApiVersion
output speechEndpoint string = speechEndpointValue
output speechRegion string = speechLocation
output speechName string = speechName
output appInsightsConnectionString string = insights.outputs.connectionString
output appInsightsInstrumentationKey string = insights.outputs.instrumentationKey
output foundryHubEndpoint string = aiEndpointValue
output foundryHubName string = aiAccountName
output foundryProjectEndpoint string = aiProject.outputs.defaultEndpoint
output foundryProjectName string = aiProjectName
output swaHostname string = swa.outputs.defaultHostname
output swaName string = swa.outputs.name
