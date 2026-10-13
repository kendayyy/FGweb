param([ValidateSet('stop','restore')][string]$Mode)
$ErrorActionPreference = 'Stop'
$privatePath = '.runtime/t30/cockpit-restart2.json'
$executable = 'C:\Users\PC\AppData\Local\Cockpit Tools\cockpit-tools.exe'
if ($Mode -eq 'stop') {
    if (Test-Path -LiteralPath $privatePath) { throw 'Private resource record already exists' }
    $rows = @(Get-CimInstance Win32_Process -Filter "Name = 'cockpit-tools.exe'")
    if ($rows.Count -ne 1) { throw 'Expected exactly one authorized Cockpit process' }
    $row = $rows[0]
    if ($row.ExecutablePath -ne $executable) { throw 'Executable mismatch' }
    $command = $row.CommandLine.Trim()
    if ($command -ne $executable -and $command -ne ('"' + $executable + '"')) { throw 'Restart arguments require preservation; no close performed' }
    [ordered]@{savedAt=[DateTime]::UtcNow.ToString('o');processId=$row.ProcessId;executablePath=$row.ExecutablePath;commandLine=$row.CommandLine} | ConvertTo-Json | Set-Content -LiteralPath $privatePath -Encoding utf8
    $process = Get-Process -Id $row.ProcessId
    $requested = $process.CloseMainWindow()
    Start-Sleep -Seconds 2
    $remaining = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue
    if ($remaining) { Stop-Process -Id $row.ProcessId; Start-Sleep -Seconds 1 }
    if (Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue) { throw 'Authorized process still running' }
    [ordered]@{completedAt=[DateTime]::UtcNow.ToString('o');processId=$row.ProcessId;gracefulCloseRequested=$requested;exactProcessClosed=$true;restoreRequired=$true;authorization='User permits temporary close and restore';beforeNativeRun=57} | ConvertTo-Json | Set-Content -LiteralPath quality/evidence/T30/cockpit-temporary-close2.json -Encoding utf8
} else {
    $saved = Get-Content -LiteralPath $privatePath -Raw | ConvertFrom-Json
    if ($saved.executablePath -ne $executable) { throw 'Executable mismatch' }
    $command = $saved.commandLine.Trim()
    if ($command -ne $executable -and $command -ne ('"' + $executable + '"')) { throw 'Restart arguments mismatch' }
    if (-not (Get-Process -Name cockpit-tools -ErrorAction SilentlyContinue)) { Start-Process -FilePath $executable -WindowStyle Hidden }
    Start-Sleep -Seconds 2
    $running = @(Get-Process -Name cockpit-tools -ErrorAction SilentlyContinue)
    if ($running.Count -lt 1) { throw 'Cockpit restart not verified' }
    [ordered]@{restoredAt=[DateTime]::UtcNow.ToString('o');running=$true;processIds=@($running.Id);originalExecutableVerified=$true;argumentsVerified=$true} | ConvertTo-Json | Set-Content -LiteralPath quality/evidence/T30/cockpit-restoration2.json -Encoding utf8
}
