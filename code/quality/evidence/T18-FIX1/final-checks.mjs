import {spawnSync} from 'node:child_process';
const dir='quality/evidence/T18-FIX1';
const jobs=[
 ['required-rooms-1',process.execPath,'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test','--workspace','@fg/api','--','--runInBand','test/rooms.integration.spec.ts'],
 ['native-rooms-1',process.execPath,'quality/evidence/T18/native-rooms-review.mjs'],
 ['native-list-1',process.execPath,'quality/evidence/T18/native-list-revocation.mjs'],
 ['native-session-1',process.execPath,'quality/evidence/T18/native-session-wait.mjs'],
 ['final-lint-1',process.execPath,'node_modules/eslint/bin/eslint.js','apps/api/src/modules/rooms/rooms.service.ts','apps/api/test/rooms.integration.spec.ts','--max-warnings','0'],
 ['final-types-1',process.execPath,'node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit','--incremental','false'],
 ['final-audit-1',process.execPath,`${dir}/audit.mjs`],
 ['final-diff-1','git','diff','--check'],
];
for(const job of jobs){const r=spawnSync(process.execPath,[`${dir}/record-check.mjs`,...job],{stdio:'inherit',env:process.env,cwd:process.cwd()});if(r.status!==0){process.exit(r.status??1);}}
console.log('Independent final checks all exited0; closeout still requires regression and Codex review.');
