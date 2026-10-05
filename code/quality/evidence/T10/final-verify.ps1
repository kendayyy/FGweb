param([int]$StartIndex=0)
$ErrorActionPreference='Continue'
$checks=@(
 @{name='acceptance';command='npm run test --workspace @fg/api -- --runInBand test/profiles.integration.spec.ts';run={npm run test --workspace @fg/api -- --runInBand test/profiles.integration.spec.ts}},
 @{name='api-regression';command='node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config apps/api/jest.config.js --runInBand apps/api/test/auth.integration.spec.ts apps/api/test/profiles.integration.spec.ts'; run={node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config apps/api/jest.config.js --runInBand apps/api/test/auth.integration.spec.ts apps/api/test/profiles.integration.spec.ts}},
 @{name='review-tests';command='node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config quality/evidence/T10/jest.review.config.cjs --runInBand';run={node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config quality/evidence/T10/jest.review.config.cjs --runInBand}},
 @{name='api-build';command='npm run build --workspace @fg/api';run={npm run build --workspace @fg/api}},
 @{name='api-review-types';command='node node_modules/typescript/bin/tsc -p quality/evidence/T10/tsconfig.review.json';run={node node_modules/typescript/bin/tsc -p quality/evidence/T10/tsconfig.review.json}},
 @{name='lint';command='npm run lint';run={npm run lint}},
 @{name='diff';command='git diff --check';run={git diff --check}},
 @{name='native';command='node --env-file=.env.local quality/evidence/T10/native-smoke.mjs';run={node --env-file=.env.local quality/evidence/T10/native-smoke.mjs}},
 @{name='audit';command='node quality/evidence/T10/final-audit.mjs';run={node quality/evidence/T10/final-audit.mjs}}
)
$records=@()
if($StartIndex -gt 0){$records=@(Get-Content quality/evidence/T10/final-verification.json -Raw|ConvertFrom-Json|Select-Object -First $StartIndex)}
foreach($check in ($checks | Select-Object -Skip $StartIndex)){
 $log="quality/evidence/T10/final-$($check.name).txt"
 $began=[DateTime]::UtcNow.ToString('o')
 $global:LASTEXITCODE=0
 & $check.run *> $log
 $taskExit=$LASTEXITCODE
 $records+=@{command=$check.command;cwd='E:/FGweb/code';startedAt=$began;completedAt=[DateTime]::UtcNow.ToString('o');exitCode=$taskExit;evidencePath=$log;evidenceSha256=(Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLower()}
 $records|ConvertTo-Json -Depth 6|Set-Content -LiteralPath quality/evidence/T10/final-verification.json -Encoding utf8
 Write-Output "$($check.name): exit $taskExit"
 if($taskExit -ne 0){exit $taskExit}
}

