$ErrorActionPreference = 'Stop'
$dockerApp = 'C:/Program Files/Docker/Docker/Docker Desktop.exe'
if (-not (Get-Process 'com.docker.backend' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $dockerApp -WindowStyle Hidden
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Installed Docker Desktop daemon did not become ready' }
& docker compose --env-file infra/.env.local -f infra/compose.local.yml up -d --wait postgres redis
exit $LASTEXITCODE
