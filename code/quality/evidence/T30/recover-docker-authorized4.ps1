$taskDockerPath = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (-not (Test-Path -LiteralPath $taskDockerPath)) { throw 'Docker Desktop executable unavailable' }
if (Get-Process 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue) { throw 'Unexpected existing Docker process; inspect before recovery' }
Start-Process -FilePath $taskDockerPath -WindowStyle Hidden
Write-Output 'Started authorized Docker Desktop hidden; no cockpit or other app startup. Engine readiness still requires verification.'
