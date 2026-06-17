using './main.bicep'

param environment = 'staging'
param location = 'uksouth'
param corsOrigins = ''
param aiRegion = 'swedencentral'

param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY', '')
param microsoftClientId = readEnvironmentVariable('MICROSOFT_CLIENT_ID', '')
param microsoftTenantId = readEnvironmentVariable('MICROSOFT_TENANT_ID', '')
