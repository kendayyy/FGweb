$ErrorActionPreference = 'Stop'
$taskEvidenceDir = Join-Path (Get-Location) 'quality/evidence/T30'
$taskProcesses = @(Get-Process -Name brave -ErrorAction SilentlyContinue)
$taskSnapshot = @($taskProcesses | ForEach-Object { [pscustomobject]@{ id=$_.Id; name=$_.ProcessName; path=$_.Path; startUtc=$_.StartTime.ToUniversalTime().ToString('o'); workingSetBytes=$_.WorkingSet64 } })
$taskStarted = [DateTimeOffset]::UtcNow.ToString('o')
if (Test-Path -LiteralPath (Join-Path $taskEvidenceDir 'brave-temporary-close2.json')) { throw 'Immutable record exists' }
[pscustomobject]@{ startedAt=$taskStarted; authorization='User explicitly authorized temporarily closing Brave during FG testing'; processes=$taskSnapshot } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskEvidenceDir 'brave-temporary-close2.json')
foreach ($taskProcess in $taskProcesses) { if ($taskProcess.MainWindowHandle -ne 0) { [void]$taskProcess.CloseMainWindow() } }
Start-Sleep -Seconds 8
$taskStopped = @()
foreach ($taskSaved in $taskSnapshot) {
    $taskCurrent = Get-Process -Id $taskSaved.id -ErrorAction SilentlyContinue
    if ($taskCurrent) {
        if ($taskCurrent.ProcessName -ne 'brave' -or $taskCurrent.Path -ne $taskSaved.path -or $taskCurrent.StartTime.ToUniversalTime().ToString('o') -ne $taskSaved.startUtc) { throw 'Process identity changed' }
        Stop-Process -Id $taskCurrent.Id -Force
        $taskStopped += $taskSaved.id
    }
}
Start-Sleep -Seconds 1
$taskRemaining = @(Get-Process -Name brave -ErrorAction SilentlyContinue)
if ($taskRemaining.Count -ne 0) { throw 'Brave processes remain' }
[pscustomobject]@{ completedAt=[DateTimeOffset]::UtcNow.ToString('o'); exactSavedProcessesClosed=$true; count=$taskSnapshot.Count; workingSetBytes=($taskSnapshot | Measure-Object workingSetBytes -Sum).Sum; forcedRemainingIds=$taskStopped; braveRemaining=0; cockpitStarted=$false; restoreRequiredAfterTests=$true } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskEvidenceDir 'brave-temporary-close2-result.json')
Write-Output 'Authorized Brave closure complete; exact process identities checked. Restore after test work.'
