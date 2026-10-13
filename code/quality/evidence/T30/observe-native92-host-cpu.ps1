param([Parameter(Mandatory=$true)][string]$OutputPath,[Parameter(Mandatory=$true)][string]$StopPath)
$ErrorActionPreference = 'Stop'
$probeRoot = [IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar
$probeOutput = [IO.Path]::GetFullPath($OutputPath)
$probeStop = [IO.Path]::GetFullPath($StopPath)
if (!$probeOutput.StartsWith($probeRoot,[StringComparison]::OrdinalIgnoreCase) -or !$probeStop.StartsWith($probeRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Observer files must remain in task evidence directory' }
if (Test-Path -LiteralPath $probeOutput) { throw 'Preserve previous observer evidence' }
$probeStarted = [DateTime]::UtcNow
$probePrevious = @{}
$probeRecords = [Collections.Generic.List[object]]::new()
$probeFailures = 0
$probePreviousAt = [DateTime]::UtcNow
while (([DateTime]::UtcNow - $probeStarted).TotalSeconds -lt 420 -and !(Test-Path -LiteralPath $probeStop)) {
    $probeNow = [DateTime]::UtcNow
    $probeElapsed = ($probeNow - $probePreviousAt).TotalSeconds
    $probeCurrent = @{}
    $probeRows = [Collections.Generic.List[object]]::new()
    try {
        foreach ($probeProcess in Get-Process) {
            try {
                if ($null -eq $probeProcess.CPU) { continue }
                $probeCurrent[$probeProcess.Id] = [double]$probeProcess.CPU
                if ($probePrevious.ContainsKey($probeProcess.Id) -and $probeElapsed -gt 0) {
                    $probeDelta = [double]$probeProcess.CPU - [double]$probePrevious[$probeProcess.Id]
                    if ($probeDelta -ge 0) {
                        $probeRows.Add([pscustomobject]@{ pid=$probeProcess.Id; name=$probeProcess.ProcessName; cpuSecondsDelta=[math]::Round($probeDelta,4); oneCorePercent=[math]::Round(100*$probeDelta/$probeElapsed,2); workingSetMB=[math]::Round($probeProcess.WorkingSet64/1MB,1) })
                    }
                }
            } catch { }
        }
        if ($probePrevious.Count -gt 0) {
            $probeRecords.Add([pscustomobject]@{ at=$probeNow.ToString('o'); intervalSeconds=[math]::Round($probeElapsed,3); topCpu=@($probeRows | Sort-Object cpuSecondsDelta -Descending | Select-Object -First 12); topMemory=@($probeRows | Sort-Object workingSetMB -Descending | Select-Object -First 8) })
        }
    } catch { $probeFailures++ }
    $probePrevious = $probeCurrent
    $probePreviousAt = $probeNow
    Start-Sleep -Seconds 5
}
$probeResult = [pscustomobject]@{ startedAt=$probeStarted.ToString('o'); completedAt=[DateTime]::UtcNow.ToString('o'); readonly=$true; processPrioritiesChanged=$false; noCommandLinesPathsEnvironmentOrSecrets=$true; failureCount=$probeFailures; stopRequested=(Test-Path -LiteralPath $probeStop); samples=$probeRecords.ToArray() }
[IO.File]::WriteAllText($probeOutput,($probeResult | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
if ($probeFailures -gt 0) { exit 1 }
