@description('Name of the Cosmos DB account')
param accountName string

@description('Name of the SQL database to host the containers')
param databaseName string

@description('Array of containers to create (each object should contain name, partitionKey, indexingPolicy, defaultTtl, computedProperties etc). Note: uniqueKeyPolicy and conflictResolutionPolicy are create-time-only and cannot be modified after container creation.')
param containers array = []

// Reference the account and database as existing resources
resource accountExisting 'Microsoft.DocumentDB/databaseAccounts@2025-05-01-preview' existing = {
  name: accountName
}

resource dbExisting 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-05-01-preview' existing = {
  parent: accountExisting
  name: databaseName
}

// Create the containers for the specified database
@batchSize(1)
resource containersRes 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-05-01-preview' = [for container in (containers ?? []): {
  parent: dbExisting
  name: container.name
  properties: {
    // Always include options (can be empty)
    options: container.?options != null ? container.options : {}

    resource: union(
      {
        id: container.name
        partitionKey: container.partitionKey
      },
      // Only include optional properties when non-null
      container.?indexingPolicy != null ? { indexingPolicy: container.indexingPolicy } : {},
      container.?defaultTtl != null ? { defaultTtl: container.defaultTtl } : {},
      container.?computedProperties != null ? { computedProperties: container.computedProperties } : {},
      container.?uniqueKeyPolicy != null ? { uniqueKeyPolicy: container.uniqueKeyPolicy } : {},
      container.?conflictResolutionPolicy != null ? { conflictResolutionPolicy: container.conflictResolutionPolicy } : {}
    )
  }
}]
