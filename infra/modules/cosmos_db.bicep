param name string
param location string
param tags object = {}
param databases array = []
param identityType string = 'SystemAssigned'

@description('Enable Analytical Storage (Analytical Store)')
param enableAnalyticalStorage bool = false

@description('Analytical storage configuration (default: { schemaType: "WellDefined" })')
param analyticalStorageConfiguration object = { schemaType: 'WellDefined' }

@description('Enable free tier for account')
param enableFreeTier bool = false

@description('Public Network Access: "Enabled" or "Disabled"')
param publicNetworkAccess string = 'Enabled'

@description('Enable automatic failover across regions')
param enableAutomaticFailover bool = true

@description('Enable multiple write locations')
param enableMultipleWriteLocations bool = false


@description('Enable virtual network filter')
param isVirtualNetworkFilterEnabled bool = false

@description('Virtual network rules (array)')
param virtualNetworkRules array = []

@description('Disable key based metadata write access')
param disableKeyBasedMetadataWriteAccess bool = false

@description('Enable materialized views')
param enableMaterializedViews bool = false

@description('Default identity used by the account (e.g. FirstPartyIdentity)')
param defaultIdentity string = 'FirstPartyIdentity'

@description('Network ACL bypass setting (None | AzureServices)')
param networkAclBypass string = 'None'

@description('IP rules array')
param ipRules array = []

@description('Additional capabilities to enable on the account')
param capabilities array = []

@description('Backup policy object. Use the shape from docs (Periodic or Continuous) when customizing)')
param backupPolicy object = {
  type: 'Periodic'
  periodicModeProperties: {
    backupIntervalInMinutes: 240
    backupRetentionIntervalInHours: 8
    backupStorageRedundancy: 'Geo'
  }
}

@description('Minimal TLS version (e.g. Tls12)')
param minimalTlsVersion string = 'Tls12'

@description('Capacity mode (Serverless | Provisioned)')
param capacityMode string = 'Serverless'

@description('Total throughput limit used for Serverless capacityMode')
param totalThroughputLimit int = 4000

resource account 'Microsoft.DocumentDB/databaseAccounts@2025-05-01-preview' = {
  name: name
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  identity: {
    type: identityType
  }
  properties: {
    // Networking & availability
    publicNetworkAccess: publicNetworkAccess
    enableAutomaticFailover: enableAutomaticFailover
    enableMultipleWriteLocations: enableMultipleWriteLocations
    isVirtualNetworkFilterEnabled: isVirtualNetworkFilterEnabled
    virtualNetworkRules: virtualNetworkRules

    // Feature flags & capabilities
    disableKeyBasedMetadataWriteAccess: disableKeyBasedMetadataWriteAccess
    enableFreeTier: enableFreeTier
    enableAnalyticalStorage: enableAnalyticalStorage
    analyticalStorageConfiguration: enableAnalyticalStorage ? analyticalStorageConfiguration : null
    enableMaterializedViews: enableMaterializedViews
    capabilities: capabilities

    // Identity / Security
    defaultIdentity: defaultIdentity
    networkAclBypass: networkAclBypass
    ipRules: ipRules
    minimalTlsVersion: minimalTlsVersion
    disableLocalAuth: false

    // Backup & diagnostics
    backupPolicy: empty(backupPolicy) ? null : backupPolicy
    diagnosticLogSettings: {
      enableFullTextQuery: 'None'
    }

    // Capacity & consistency
    databaseAccountOfferType: 'Standard'
    capacityMode: capacityMode
    capacity: capacityMode == 'Serverless' ? { totalThroughputLimit: totalThroughputLimit } : null
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }

    // Location
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]

    // Misc
    cors: []
    networkAclBypassResourceIds: []
  }
}

output id string = account.id
output name string = account.name
output endpoint string = account.properties.documentEndpoint
output principalId string = account.identity.principalId
output tenantId string = account.identity.tenantId

// Create any SQL databases and containers passed in via `databases` parameter
// Create databases and nested containers per-database to avoid out-of-bounds template indexing
@batchSize(1)
resource sqlDatabases 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-05-01-preview' = [for db in databases: {
  parent: account
  name: db.name
  properties: {
    resource: {
      id: db.name
    }
    // Support either manual throughput or autoscale on database
    options: db.?autoscaleMaxThroughput != null ? { autoscaleSettings: { maxThroughput: db.autoscaleMaxThroughput } } : (db.?throughput != null ? { throughput: db.throughput } : null)
  }

  // Containers are created at top-level as flattened resources (see `sqlContainers` below)
  // (Nested container resources inside a resource with a for-expression are not supported by Bicep.)
}]

// Create containers using a module per-database to avoid nested resource restrictions
@batchSize(1)
module containersModule './cosmos_db_containers.bicep' = [for dbIndex in range(0, length(databases)): {
  name: 'createContainers-${databases[dbIndex].name}'
  params: {
    accountName: name
    databaseName: databases[dbIndex].name
    containers: databases[dbIndex].containers ?? []
  }
  dependsOn: [
    sqlDatabases[dbIndex]
  ]
}]

output databasesParam array = databases
