$fgChecks = @(
@{name='acceptance';exe='npm.cmd';args=@('run','test','--workspace','@fg/database','--','test/call-outbox.test.ts')},
@{name='db-regression';exe='npm.cmd';args=@('run','test','--workspace','@fg/database')},
@{name='build';exe='npm.cmd';args=@('run','build','--workspace','@fg/database')},
@{name='codex-t07';exe='node';args=@('--test','quality/evidence/T07/codex-regressions.test.mjs')},
@{name='codex-t05';exe='node';args=@('--test','quality/evidence/T05/codex-regressions.test.mjs')},
@{name='codex-t06';exe='node';args=@('--test','quality/evidence/T06/codex-regressions.test.mjs')},
@{name='typecheck';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T07/tsconfig.check.json')},
@{name='lint';exe='npm.cmd';args=@('run','lint')},
@{name='migration-consistency';exe='npm.cmd';args=@('run','db:generate','--workspace','@fg/database')})
$fgRecords=@()
foreach($fgCheck in $fgChecks){
 $fgStart=[DateTime]::UtcNow.ToString('o');$fgPath='quality/evidence/T07/loop2-'+$fgCheck.name+'.txt';$fgArgs=$fgCheck.args
 & $fgCheck.exe @fgArgs *> $fgPath
 $fgExit=$LASTEXITCODE
 $fgRecords+=@{command=($fgCheck.exe.Replace('.cmd','')+' '+($fgArgs -join ' '));cwd='E:/FGweb/code';startedAt=$fgStart;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$fgExit;evidencePath=$fgPath;evidenceSha256=(Get-FileHash $fgPath -Algorithm SHA256).Hash.ToLower()}
 $fgRecords | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 quality/evidence/T07/loop2-verification.json
 Write-Output ($fgCheck.name+' exit='+$fgExit);Get-Content $fgPath -Tail 8
 if($fgExit -ne 0){exit $fgExit}
}
