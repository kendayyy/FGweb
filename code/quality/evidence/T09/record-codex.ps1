$fgChecks=@(
 @{name='acceptance';exe='npm.cmd';args=@('run','test','--workspace','@fg/web','--','test/auth.test.tsx')},
 @{name='build';exe='npm.cmd';args=@('run','build','--workspace','@fg/web')},
 @{name='types';exe='node';args=@('node_modules/typescript/bin/tsc','-p','quality/evidence/T09/tsconfig.check.json')},
 @{name='lint';exe='npm.cmd';args=@('run','lint')},
 @{name='redirect';exe='node';args=@('quality/evidence/T09/codex-redirect-regression.mjs')}
)
$fgRecords=@()
foreach($fgCheck in $fgChecks){
 $fgStart=[DateTime]::UtcNow.ToString('o');$fgPath='quality/evidence/T09/codex-review-'+$fgCheck.name+'.txt';$fgArgs=$fgCheck.args
 & $fgCheck.exe @fgArgs *> $fgPath
 $fgExit=$LASTEXITCODE
 $fgRecords+=@{command=($fgCheck.exe.Replace('.cmd','')+' '+($fgArgs -join ' '));cwd='E:/FGweb/code';startedAt=$fgStart;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$fgExit;evidencePath=$fgPath;evidenceSha256=(Get-FileHash $fgPath -Algorithm SHA256).Hash.ToLower()}
 $fgRecords | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 quality/evidence/T09/codex-verification.json
 Write-Output ($fgCheck.name+' exit='+$fgExit);Get-Content $fgPath -Tail 6
}
