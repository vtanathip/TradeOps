# Stop TradingView and the MCP server process

Write-Host "Stopping TradingView..."
$tv = Get-Process -Name "TradingView" -ErrorAction SilentlyContinue
if ($tv) {
    $tv | Stop-Process -Force
    Write-Host "TradingView stopped."
} else {
    Write-Host "TradingView is not running."
}

Write-Host "Stopping Node MCP server..."
$node = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*tradingview-mcp*"
}
if ($node) {
    $node | Stop-Process -Force
    Write-Host "MCP server stopped."
} else {
    Write-Host "No MCP server process found."
}
