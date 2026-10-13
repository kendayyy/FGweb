$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runtimeDir = Join-Path $bridgeRoot '.runtime/telegram-bridge'
$runnerPath = Join-Path $PSScriptRoot 'runner.mjs'
$nodePath = (Get-Content -LiteralPath (Join-Path $runtimeDir 'node-path.txt') -Raw).Trim()
$watchMutex = [Threading.Mutex]::new($false, 'Local\FGTelegramBridgeWatchdog')
$ownsMutex = $false
try { $ownsMutex = $watchMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
if (-not $ownsMutex) { $watchMutex.Dispose(); exit 0 }
try {
    while ($true) {
        try {
            $runnerAlive = $false
            $lockFile = Join-Path $runtimeDir 'running.lock'
            if (Test-Path -LiteralPath $lockFile) {
                $runnerPid = [int](Get-Content -LiteralPath $lockFile -Raw)
                if ($runnerPid -gt 0) {
                    $runnerInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $runnerPid"
                    $runnerAlive = $runnerInfo -and $runnerInfo.Name -eq 'node.exe' -and $runnerInfo.CommandLine.Contains($runnerPath)
                    if ($runnerInfo -and -not $runnerAlive) { throw 'Unrelated process lock; local review required' }
                }
            }
            if (-not $runnerAlive) {
                $childProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $runnerPath + '"'), 'run') -WorkingDirectory $bridgeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'stderr.log')
                @{at=[DateTimeOffset]::UtcNow.ToString('o');event='runner_started';pid=$childProcess.Id} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $runtimeDir 'watchdog.log')
            }
        } catch {
            @{at=[DateTimeOffset]::UtcNow.ToString('o');event='retry_configuration_or_connection'} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $runtimeDir 'watchdog.log')
        }
        Start-Sleep -Seconds 30
    }
} finally {
    if ($ownsMutex) { $watchMutex.ReleaseMutex() }
    $watchMutex.Dispose()
}
