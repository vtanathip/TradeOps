# Load .env from project root and set vars in current user scope
$envFile = Join-Path $PSScriptRoot "..\\.env"
$envFile = (Resolve-Path $envFile).Path

foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line.Trim() -eq '') { continue }
    $key, $value = $line -split '=', 2
    $key = $key.Trim()
    $value = $value.Trim()
    [System.Environment]::SetEnvironmentVariable($key, $value, 'User')
    Write-Host "SET $key=$value"
}

Write-Host ""
Write-Host "Done. Restart Claude Code for changes to take effect."
