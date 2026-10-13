$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runtimeDir = Join-Path $bridgeRoot '.runtime/telegram-bridge'
Set-Location -LiteralPath $bridgeRoot
if ($env:CODEX_APP_TOOLS_PIPE_PATH -and $env:CODEX_THREAD_ID -eq '01a11d13-223b-70e0-afd3-a1736eb6f62e') {
    $connectionFile = Join-Path $runtimeDir 'connection.json'
    $connection = Get-Content -LiteralPath $connectionFile -Raw | ConvertFrom-Json
    $connection.pipe=$env:CODEX_APP_TOOLS_PIPE_PATH
    $connection.thread=$env:CODEX_THREAD_ID
    $connection | ConvertTo-Json | Set-Content -LiteralPath $connectionFile
}
$nodePath = (Get-Command node).Source
$runnerPath = Join-Path $PSScriptRoot 'runner.mjs'
$bridgeProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $runnerPath + '"'),'run') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'stderr.log')
[Console]::WriteLine("Telegram bridge PID: $($bridgeProcess.Id)")
