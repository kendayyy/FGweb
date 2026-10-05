$fgChecks=@(
 @{name='contracts-tests';exe='npm.cmd';args=@('run','test','--workspace','@fg/contracts')},
 @{name='contracts-build';exe='npm.cmd';args=@('run','build','--workspace','@fg/contracts')},
 @{name='api-build';exe='npm.cmd';args=@('run','build','--workspace','@fg/api')},
 @{name='api-types';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T08/tsconfig.check.json')},
 @{name='web-types';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T09/tsconfig.check.json')},
 @{name='lint';exe='npm.cmd';args=@('run','lint')},
 @{name='diff';exe='git';args=@('diff','--check')}
)
$fgRecords=@()
foreach($fgCheck in $fgChecks){
 $fgStart=[DateTime]::UtcNow.ToString('o');$fgPath='quality/evidence/T03-FIX1/final-'+$fgCheck.name+'.txt';$fgArgs=$fgCheck.args
 & $fgCheck.exe @fgArgs *> $fgPath
 $fgExit=$LASTEXITCODE
 $fgRecords+=@{command=($fgCheck.exe.Replace('.cmd','')+' '+($fgArgs -join ' '));cwd='E:/FGweb/code';startedAt=$fgStart;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$fgExit;evidencePath=$fgPath;evidenceSha256=(Get-FileHash $fgPath).Hash.ToLower()}
 $fgRecords | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 quality/evidence/T03-FIX1/final-verification.json
 Write-Output ($fgCheck.name+' exit='+$fgExit)
}
