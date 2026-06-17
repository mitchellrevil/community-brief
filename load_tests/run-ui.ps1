param(
    [int]$Port = 8089,
    [string]$HostUrl = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ($HostUrl) {
    $env:COMMUNITY_API_HOST = $HostUrl
}

$env:PYTHONPATH = "load_tests"

Write-Host "Starting Community Brief Locust web UI..." -ForegroundColor Cyan
Write-Host "Open http://localhost:$Port" -ForegroundColor Green
Write-Host "Target API: $($env:COMMUNITY_API_HOST)" -ForegroundColor DarkGray
Write-Host "Writes enabled: $($env:COMMUNITY_ENABLE_WRITES)" -ForegroundColor DarkGray
Write-Host "Admin writes enabled: $($env:COMMUNITY_ENABLE_ADMIN_WRITES)" -ForegroundColor DarkGray
Write-Host "Allowed write flows: $($env:COMMUNITY_ALLOWED_WRITE_FLOWS)" -ForegroundColor DarkGray

py -m locust `
    -f load_tests/locustfile.py `
    --web-host 127.0.0.1 `
    --web-port $Port
