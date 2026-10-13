$ErrorActionPreference='Stop'
$taskDir=Join-Path (Get-Location) 'quality/evidence/T30'
$taskSaved=Get-Content -LiteralPath (Join-Path $taskDir 'brave-temporary-close2.json') -Raw | ConvertFrom-Json
$taskRemaining=@(Get-Process -Name brave -ErrorAction SilentlyContinue)
if ($taskRemaining.Count -ne 0) { throw 'Brave is still running' }
[pscustomobject]@{completedAt=[DateTimeOffset]::UtcNow.ToString('o'); actualBraveRemaining=0; snapshotProcessCount=$taskSaved.processes.Count; closureCommandExitCode=1; closureFailure='Process exited between identity check and Stop-Process'; restoreRequiredAfterTests=$true; cockpitStarted=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDir 'brave-temporary-close2-result.json')
Write-Output 'Independent check confirms zero Brave processes; prior close command race exit1 retained.'
