$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$lockFile = Join-Path $bridgeRoot '.runtime/telegram-bridge/running.lock'
if (-not (Test-Path -LiteralPath $lockFile)) { Write-Output 'No bridge lock'; return }
$bridgePid = [int](Get-Content -LiteralPath $lockFile -Raw)
if ($bridgePid -lt 1) { throw 'Invalid PID' }
$bridgeInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $bridgePid"
if ($bridgeInfo) {
    $runnerPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runner.mjs'))
    if ($bridgeInfo.Name -ne 'node.exe' -or -not $bridgeInfo.CommandLine.Contains($runnerPath)) { throw 'PID is not the expected bridge runner' }
    Stop-Process -Id $bridgePid
}
Remove-Item -LiteralPath $lockFile
Write-Output 'Bridge stopped; Codex tasks unchanged'
