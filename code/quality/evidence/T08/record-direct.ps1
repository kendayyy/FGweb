$fgChecks = @(
@{name='build';exe='npm.cmd';args=@('run','build','--workspace','@fg/api')},
@{name='acceptance';exe='npm.cmd';args=@('run','test','--workspace','@fg/api','--','--runInBand','test/auth.integration.spec.ts')},
@{name='test-types';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T08/tsconfig.check.json')},
@{name='lint';exe='npm.cmd';args=@('run','lint')})
$fgRecords=@()
foreach($fgCheck in $fgChecks){
 $fgStart=[DateTime]::UtcNow.ToString('o');$fgPath='quality/evidence/T08/direct-final-'+$fgCheck.name+'.txt';$fgArgs=$fgCheck.args
 & $fgCheck.exe @fgArgs *> $fgPath
 $fgExit=$LASTEXITCODE
 $fgRecords+=@{command=($fgCheck.exe.Replace('.cmd','')+' '+($fgArgs -join ' '));cwd='E:/FGweb/code';startedAt=$fgStart;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$fgExit;evidencePath=$fgPath;evidenceSha256=(Get-FileHash $fgPath -Algorithm SHA256).Hash.ToLower()}
 $fgRecords | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 quality/evidence/T08/direct-verification.json
 Write-Output ($fgCheck.name+' exit='+$fgExit);Get-Content $fgPath -Tail 8
}
if(@($fgRecords | Where-Object exitCode -ne 0).Count){exit 1}
