# Remove all vars defined in .env from current user scope
$envFile = Join-Path $PSScriptRoot "..\\.env"
$envFile = (Resolve-Path $envFile).Path

foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    $key = ($line -split '=', 2)[0].Trim()
    [System.Environment]::SetEnvironmentVariable($key, $null, 'User')
    Write-Host "UNSET $key"
}

Write-Host ""
Write-Host "Done. Restart Claude Code for changes to take effect."
