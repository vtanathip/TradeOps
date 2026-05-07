# Load .env from project root
$envFile = Join-Path $PSScriptRoot ".." ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile"
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
}

$batPath = $env:TRADINGVIEW_WINDOW_LAUNCH_BAT
if (-not $batPath) {
    Write-Error "TRADINGVIEW_WINDOW_LAUNCH_BAT is not set in .env"
    exit 1
}

if (-not (Test-Path $batPath)) {
    Write-Error "Bat file not found: $batPath"
    exit 1
}

Write-Host "Launching: $batPath"
& cmd.exe /c "`"$batPath`""

# Run tv_health_check via the CLI to verify CDP connection
$cliPath = $env:TRADINGVIEW_CLI_PATH
if ($cliPath) {
    if (Test-Path $cliPath) {
        Write-Host "`nRunning tv_health_check..."
        & node $cliPath status
    }
    else {
        Write-Warning "CLI not found at $cliPath, skipping health check"
    }
}
else {
    Write-Warning "TRADINGVIEW_MCP_PATH not set, skipping health check"
}
