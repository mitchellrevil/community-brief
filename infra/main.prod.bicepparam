using './main.bicep'

param environment = 'prod'
param location = 'uksouth'
param corsOrigins = 'https://communitybrief.example.org'
param aiRegion = 'swedencentral'

param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY', '')
param microsoftClientId = readEnvironmentVariable('MICROSOFT_CLIENT_ID', '')
param microsoftTenantId = readEnvironmentVariable('MICROSOFT_TENANT_ID', '')
