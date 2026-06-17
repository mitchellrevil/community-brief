param name string
param location string
param tags object = {}
param serverFarmId string
param appInsightsConnectionString string
param appSettings array = []
param appCommandLine string = ''
param identityType string = 'SystemAssigned'

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: name
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: identityType
  }
  properties: {
    serverFarmId: serverFarmId
    siteConfig: {
      appSettings: union([
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITE_WEBDEPLOY_USE_SCM'
          value: 'true'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
      ], appSettings)
      linuxFxVersion: 'PYTHON|3.11'
      appCommandLine: appCommandLine
    }
  }
}

output id string = webApp.id
output name string = webApp.name
output defaultHostName string = webApp.properties.defaultHostName
output principalId string = webApp.identity.principalId
output tenantId string = webApp.identity.tenantId
