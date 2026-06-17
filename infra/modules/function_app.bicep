param name string
param location string
param tags object = {}
param serverFarmId string
param storageAccountName string
param appInsightsConnectionString string
param appSettings array = []

resource storage 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: storageAccountName
}

// Settings that are hardcoded below and should be filtered from incoming appSettings
var hardcodedSettingNames = [
  'AzureWebJobsStorage'
  'AzureWebJobsStorage__accountName'
  'AzureWebJobsStorage__credential'
  'AzureWebJobsaudio__accountName'
  'AzureWebJobsaudio__credential'
  'WEBSITE_RUN_FROM_PACKAGE'
  'SCM_DO_BUILD_DURING_DEPLOYMENT'
  'ENABLE_ORYX_BUILD'
  'FUNCTIONS_EXTENSION_VERSION'
  'FUNCTIONS_WORKER_RUNTIME'
  'APPLICATIONINSIGHTS_CONNECTION_STRING'
  'WEBSITE_CONTENTSHARE'
  'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
]

// Filter out Azure Files settings and hardcoded settings to prevent conflicts
var filteredAppSettings = [for setting in appSettings: !contains(hardcodedSettingNames, setting.name) ? setting : null]
var cleanAppSettings = filter(filteredAppSettings, s => s != null)

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: serverFarmId
    siteConfig: {
      appSettings: union([
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'AzureWebJobsaudio__accountName'
          value: storage.name
        }
        {
          name: 'AzureWebJobsaudio__credential'
          value: 'managedidentity'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
      ], cleanAppSettings)
      linuxFxVersion: 'Python|3.11'
    }
  }
}

output id string = functionApp.id
output name string = functionApp.name
output defaultHostName string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
output tenantId string = functionApp.identity.tenantId
