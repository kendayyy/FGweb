param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath 'E:/FGweb/code'
$taskRequest = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
$Host.UI.RawUI.WindowTitle = "FG $($taskRequest.task) - $($taskRequest.label)"
& node 'scripts/record-visible-test.mjs' $RequestPath
$taskExitCode = $LASTEXITCODE
Write-Host "Recorder/test exit code: $taskExitCode. Results retained in this window."
