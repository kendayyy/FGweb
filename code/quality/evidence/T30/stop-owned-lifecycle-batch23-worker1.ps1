$taskWorker = Get-CimInstance Win32_Process -Filter 'ProcessId = 33756'
if (-not $taskWorker -or $taskWorker.ExecutablePath -ne 'C:\Program Files\nodejs\node.exe' -or $taskWorker.CommandLine -notmatch '--config quality/evidence/T30/lifecycle-lease-batch-jest2.config.cjs' -or $taskWorker.CommandLine -notmatch '--runTestsByPath quality/evidence/T30/lifecycle-lease-batch-tests2/t30-lifecycle-lease-batch.integration.spec.ts') { throw 'Own exact lifecycle worker identity mismatch' }
Stop-Process -Id $taskWorker.ProcessId -ErrorAction Stop
Write-Output 'Stopped only exact task-owned hung Jest worker 33756; driver finally restore remains required.'
