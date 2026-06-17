<#
.SYNOPSIS
    Package and deploy Community Brief apps to an existing canonical infra resource group.

.DESCRIPTION
    Builds deployment packages for the backend API, Azure Function app, and frontend,
    then deploys them to resources named by infra/main.bicep:

      rg-{environment}-community-{location}
      web-{environment}-community-{location}
      func-{environment}-community-{location}
      swa-{environment}-community-{location}

    The script deploys app code only. Infrastructure-owned settings stay in Bicep.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $false)]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment = '',

    [Parameter(Mandatory = $false)]
    [string]$Location = '',

    [Parameter(Mandatory = $false)]
    [string]$AppName = 'community',

    [Parameter(Mandatory = $false)]
    [string]$StaticWebAppDeploymentToken = '',

    [Parameter(Mandatory = $false)]
    [switch]$SkipPackage,

    [Parameter(Mandatory = $false)]
    [switch]$SkipFrontend,

    [Parameter(Mandatory = $false)]
    [switch]$SkipHealthCheck,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$artifactsDir = Join-Path $repoRoot 'artifacts'
$backendArtifact = Join-Path $artifactsDir 'backend_app.zip'
$functionArtifact = Join-Path $artifactsDir 'az-func-audio.zip'
$frontendArtifact = Join-Path $artifactsDir 'frontend_app'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter(Mandatory = $false)]
        [string]$WorkingDirectory = $repoRoot
    )

    $display = "$FilePath $($Arguments -join ' ')"
    if ($DryRun) {
        Write-Host "DRY RUN: $display"
        return
    }

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            $code = $LASTEXITCODE
            throw "Command failed with exit code $code : $display"
        }
    }
    finally {
        Pop-Location
    }
}

function New-CleanDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ($DryRun) {
        Write-Host "DRY RUN: recreate directory $Path"
        return
    }

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Resolve-CanonicalNames {
    if (-not $Environment -or -not $Location) {
        $pattern = '^rg-(?<environment>dev|staging|prod)-(?<appName>[^-]+)-(?<location>.+)$'
        if ($ResourceGroupName -notmatch $pattern) {
            throw "Resource group '$ResourceGroupName' is not canonical. Use rg-{environment}-$AppName-{location}, or pass -Environment and -Location."
        }

        if (-not $Environment) {
            $script:Environment = $Matches.environment
        }
        if (-not $Location) {
            $script:Location = $Matches.location
        }
        if ($AppName -eq 'community') {
            $script:AppName = $Matches.appName
        }
    }

    [pscustomobject]@{
        ResourceGroupName = $ResourceGroupName
        WebAppName        = "web-$Environment-$AppName-$Location"
        FunctionAppName   = "func-$Environment-$AppName-$Location"
        StaticWebAppName  = "swa-$Environment-$AppName-$Location"
        WebAppHostname    = "web-$Environment-$AppName-$Location.azurewebsites.net"
    }
}

function Compress-Directory {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    if ($DryRun) {
        Write-Host "DRY RUN: compress $SourcePath to $DestinationPath"
        return
    }

    if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Force
    }

    $items = Join-Path $SourcePath '*'
    Compress-Archive -Path $items -DestinationPath $DestinationPath -Force
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath,
        [Parameter(Mandatory = $false)][string[]]$Exclude = @()
    )

    if ($DryRun) {
        Write-Host "DRY RUN: copy $SourcePath to $DestinationPath"
        return
    }

    Get-ChildItem -LiteralPath $SourcePath -Force -Exclude $Exclude |
        Copy-Item -Destination $DestinationPath -Recurse -Force
}

function Build-BackendPackage {
    $source = Join-Path $repoRoot 'backend_app'
    $staging = Join-Path $artifactsDir 'backend_app_staging'
    Write-Step 'Packaging backend API'
    New-CleanDirectory -Path $staging

    if (-not $DryRun) {
        Copy-Item -LiteralPath (Join-Path $source 'app') -Destination $staging -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $source 'requirements.txt') -Destination $staging -Force
    }

    $packages = Join-Path $staging '.python_packages/lib/site-packages'
    Invoke-External -FilePath 'python' -Arguments @(
        '-m', 'pip', 'install',
        '-r', (Join-Path $source 'requirements.txt'),
        '--target', $packages,
        '--platform', 'manylinux2014_x86_64',
        '--only-binary=:all:',
        '--python-version', '311',
        '--implementation', 'cp'
    )
    Compress-Directory -SourcePath $staging -DestinationPath $backendArtifact
}

function Build-FunctionPackage {
    $source = Join-Path $repoRoot 'az-func-audio'
    $staging = Join-Path $artifactsDir 'az-func-audio_staging'
    Write-Step 'Packaging Azure Function app'
    New-CleanDirectory -Path $staging
    Copy-DirectoryContents -SourcePath $source -DestinationPath $staging -Exclude @(
        '.env',
        '.gitignore',
        '.pytest_cache',
        '__pycache__',
        'local.settings.json',
        'tests'
    )

    $packages = Join-Path $staging '.python_packages/lib/site-packages'
    Invoke-External -FilePath 'python' -Arguments @(
        '-m', 'pip', 'install',
        '-r', (Join-Path $source 'requirements.txt'),
        '--target', $packages,
        '--platform', 'manylinux2014_x86_64',
        '--only-binary=:all:',
        '--python-version', '311',
        '--implementation', 'cp'
    )
    Compress-Directory -SourcePath $staging -DestinationPath $functionArtifact
}

function Build-FrontendPackage {
    if ($SkipFrontend) {
        return
    }

    $source = Join-Path $repoRoot 'frontend_app'
    $dist = Join-Path $source 'dist'
    Write-Step 'Packaging frontend'
    Invoke-External -FilePath 'pnpm' -Arguments @('install', '--frozen-lockfile') -WorkingDirectory $source
    Invoke-External -FilePath 'pnpm' -Arguments @('run', 'build') -WorkingDirectory $source
    New-CleanDirectory -Path $frontendArtifact

    if (-not $DryRun) {
        Copy-DirectoryContents -SourcePath $dist -DestinationPath $frontendArtifact
        Copy-Item -LiteralPath (Join-Path $source 'staticwebapp.config.json') -Destination $frontendArtifact -Force
    }
}

function Assert-ArtifactExists {
    param([string]$Path, [string]$Label)
    if ($DryRun) {
        return
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label artifact not found: $Path"
    }
}

function Get-StaticWebAppToken {
    param([string]$StaticWebAppName)

    if ($StaticWebAppDeploymentToken) {
        return $StaticWebAppDeploymentToken
    }

    Write-Step "Reading Static Web App deployment token for $StaticWebAppName"
    $token = & az staticwebapp secrets list --resource-group $ResourceGroupName --name $StaticWebAppName --query properties.apiKey -o tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw 'Unable to read Static Web App deployment token.'
    }
    return $token
}

$names = Resolve-CanonicalNames

Write-Step "Resolved $($names.ResourceGroupName)"
Write-Host "    Web App:        $($names.WebAppName)"
Write-Host "    Function App:   $($names.FunctionAppName)"
if (-not $SkipFrontend) {
    Write-Host "    Static Web App: $($names.StaticWebAppName)"
}

if (-not $SkipPackage) {
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
    }
    Build-BackendPackage
    Build-FunctionPackage
    Build-FrontendPackage
}

Assert-ArtifactExists -Path $backendArtifact -Label 'Backend Web App'
Assert-ArtifactExists -Path $functionArtifact -Label 'Function App'
if (-not $SkipFrontend) {
    Assert-ArtifactExists -Path $frontendArtifact -Label 'Frontend'
}

Write-Step "Deploying backend artifact to $($names.WebAppName)"
Invoke-External -FilePath 'az' -Arguments @(
    'webapp', 'deploy',
    '--resource-group', $names.ResourceGroupName,
    '--name', $names.WebAppName,
    '--src-path', $backendArtifact,
    '--type', 'zip'
)

Write-Step "Deploying function artifact to $($names.FunctionAppName)"
Invoke-External -FilePath 'az' -Arguments @(
    'functionapp', 'deploy',
    '--resource-group', $names.ResourceGroupName,
    '--name', $names.FunctionAppName,
    '--src-path', $functionArtifact,
    '--type', 'zip'
)

if (-not $SkipFrontend) {
    Write-Step "Deploying frontend artifact to $($names.StaticWebAppName)"
    $token = if ($DryRun) { '<resolved at deploy time>' } else { Get-StaticWebAppToken -StaticWebAppName $names.StaticWebAppName }
    Invoke-External -FilePath 'npx' -Arguments @(
        '-y', '@azure/static-web-apps-cli', 'deploy', $frontendArtifact,
        '--deployment-token', $token,
        '--env', 'production'
    )
}

if (-not $SkipHealthCheck) {
    Write-Step "Checking backend health: https://$($names.WebAppHostname)/api/health"
    if ($DryRun) {
        Write-Host "DRY RUN: would check https://$($names.WebAppHostname)/api/health"
    }
    else {
        Invoke-WebRequest -Uri "https://$($names.WebAppHostname)/api/health" -UseBasicParsing -TimeoutSec 30 | Out-Null
    }
}

Write-Step 'Application deployment completed'
