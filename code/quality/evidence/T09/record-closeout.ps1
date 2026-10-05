$fgChecks=@(
 @{name='acceptance';exe='npm.cmd';args=@('run','test','--workspace','@fg/web','--','test/auth.test.tsx')},
 @{name='build';exe='npm.cmd';args=@('run','build','--workspace','@fg/web')},
 @{name='types';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T09/tsconfig.check.json')},
 @{name='lint';exe='npm.cmd';args=@('run','lint')},
 @{name='redirect';exe='node';args=@('quality/evidence/T09/codex-redirect-regression.mjs')}
)
$fgChecks+=@(
 @{name='all-tests';exe='npm.cmd';args=@('run','test','--workspace','@fg/web')},
 @{name='ui-layout';exe='node';args=@('quality/evidence/T09/codex-ui-layout-regression.mjs')},
 @{name='real-api';exe='node';args=@('--env-file=.env.local','quality/evidence/T09/run-real-api-harness.mjs')},
 @{name='cleanup-audit';exe='node';args=@('--env-file=.env.local','quality/evidence/T09/closeout-audit.mjs')},
 @{name='task-gate';exe='npm.cmd';args=@('run','task:check','--','T09')},
 @{name='diff';exe='git';args=@('diff','--check')}
)
$fgRecords=@()
foreach($fgCheck in $fgChecks){
 $fgStart=[DateTime]::UtcNow.ToString('o');$fgPath='quality/evidence/T09/closeout-'+$fgCheck.name+'.txt';$fgArgs=$fgCheck.args
 & $fgCheck.exe @fgArgs *> $fgPath
 $fgExit=$LASTEXITCODE
 $fgRecords+=@{command=($fgCheck.exe.Replace('.cmd','')+' '+($fgArgs -join ' '));cwd='E:/FGweb/code';startedAt=$fgStart;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$fgExit;evidencePath=$fgPath;evidenceSha256=(Get-FileHash $fgPath -Algorithm SHA256).Hash.ToLower()}
 $fgRecords | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 quality/evidence/T09/closeout-verification.json
 Write-Output ($fgCheck.name+' exit='+$fgExit);Get-Content $fgPath -Tail 6
}

