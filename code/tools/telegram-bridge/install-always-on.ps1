$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runtimeDir = Join-Path $bridgeRoot '.runtime/telegram-bridge'
$watchdogPath = Join-Path $PSScriptRoot 'watchdog.ps1'
$psPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$watchArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $watchdogPath + '"'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
try {
    $action = New-ScheduledTaskAction -Execute $psPath -Argument $watchArguments -WorkingDirectory $bridgeRoot
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
    # Account switches/app shutdown can interrupt the supervisor without a new
    # Windows logon. A repeating trigger also recovers normal/manual exits;
    # IgnoreNew and the watchdog mutex keep one active supervisor.
    $recoveryTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval ([TimeSpan]::FromMinutes(1))
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval ([TimeSpan]::FromMinutes(1)) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'FG-Telegram-Bridge' -Action $action -Trigger @($logonTrigger, $recoveryTrigger) -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName 'FG-Telegram-Bridge'
    @{mode='scheduled_task';task='FG-Telegram-Bridge';recoveryMinutes=1;at=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'always-on.json')
    Write-Output 'Registered current-user logon task and one-minute supervisor recovery'
} catch {
    # Current-user Startup registration needs no elevated rights or stored password.
    $startupDir = [Environment]::GetFolderPath('Startup')
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $startupDir 'FG Telegram Bridge.lnk'))
    $shortcut.TargetPath = $psPath
    $shortcut.Arguments = $watchArguments
    $shortcut.WorkingDirectory = $bridgeRoot
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Start-Process -FilePath $psPath -ArgumentList $watchArguments -WorkingDirectory $bridgeRoot -WindowStyle Hidden
    @{mode='startup_shortcut';scheduledTaskRegistration='unavailable';at=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'always-on.json')
    Write-Output 'Registered current-user Startup shortcut with watchdog'
}
