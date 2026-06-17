using './main.bicep'

param environment = 'dev'
param location = 'uksouth'
param corsOrigins = 'http://localhost:3000,https://communitybriefdev.example.org'
param aiRegion = 'swedencentral'

param jwtSecretKey = readEnvironmentVariable('JWT_SECRET_KEY', '')
param microsoftClientId = readEnvironmentVariable('MICROSOFT_CLIENT_ID', '')
param microsoftTenantId = readEnvironmentVariable('MICROSOFT_TENANT_ID', '')
