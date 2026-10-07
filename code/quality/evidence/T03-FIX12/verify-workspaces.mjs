import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T03-FIX12';
const checks=[
 ['build-1','node','node_modules/typescript/bin/tsc','-p','packages/contracts/tsconfig.json'],
 ['test-types-1','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['api-types-1','node','node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json','--noEmit'],
 ['web-types-1','node','node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit'],
 ['lint-1','node','node_modules/eslint/bin/eslint.js','packages/contracts/src/teams.ts','packages/contracts/src/index.ts','packages/contracts/test/room-play-sessions.test.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
];
for(const args of checks)execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit',cwd:process.cwd()});
