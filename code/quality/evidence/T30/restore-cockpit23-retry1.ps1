$ErrorActionPreference = 'Stop'
$taskExecutable = 'C:\Users\PC\AppData\Local\Cockpit Tools\cockpit-tools.exe'
$taskItems = @(Get-Process -Name cockpit-tools -ErrorAction SilentlyContinue)
if ($taskItems.Count -gt 1) { throw 'Ambiguous cockpit identity' }
$taskLaunched = $false
if ($taskItems.Count -eq 0) {
    $taskProcess = Start-Process -FilePath $taskExecutable -WorkingDirectory 'C:\Users\PC\AppData\Local\Cockpit Tools' -WindowStyle Hidden -PassThru
    $taskLaunched = $true
} else {
    $taskProcess = $taskItems[0]
    if ($taskProcess.Path -ne $taskExecutable) { throw 'Unexpected cockpit identity' }
}
Start-Sleep -Seconds 8
$taskVerified = @(Get-Process -Name cockpit-tools -ErrorAction SilentlyContinue | Where-Object Path -eq $taskExecutable)
[ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); launched = $taskLaunched; originalLaunchPid = $taskProcess.Id; actualRunningPids = @($taskVerified | ForEach-Object Id); running = ($taskVerified.Count -gt 0); executable = $taskExecutable; userAuthorizedRestore = $true; priorAttemptFailed = $true } | ConvertTo-Json | Set-Content -LiteralPath 'quality/evidence/T30/cockpit-restoration23-retry1.json' -Encoding utf8NoBOM
if ($taskVerified.Count -eq 0) { throw 'Cockpit retry not running at actual8second check' }
Write-Output 'Cockpit exact executable verified running at8seconds after retry.'
