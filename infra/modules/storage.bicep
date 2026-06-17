param name string
param location string
param skuName string = 'Standard_LRS'
param tags object = {}
param enableLifecyclePolicy bool = true
param lifecycleRetentionDays int = 30
param containerNames array = [
  'recordingscontainer'
  'transcripts'
]

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: true
    accessTier: 'Hot'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

@batchSize(1)
resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = [for containerName in containerNames: {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}]

// Lifecycle management policy for blob retention
resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = if (enableLifecyclePolicy) {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'DeleteOldBlobs'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              // Apply to all blobs in the storage account (regardless of path)
              // Note: uploadedDate filter applies to all blobs matching blobTypes above
            }
            actions: {
              baseBlob: {
                delete: {
                  daysAfterCreationGreaterThan: lifecycleRetentionDays
                }
              }
            }
          }
        }
      ]
    }
  }
}

output id string = storage.id
output name string = storage.name
output primaryEndpoints object = storage.properties.primaryEndpoints
output containerNames array = containerNames
