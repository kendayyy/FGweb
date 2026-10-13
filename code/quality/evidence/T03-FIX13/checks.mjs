import {spawnSync} from 'node:child_process';
const dir='quality/evidence/T03-FIX13';
const commands=[
 ['build-1','node_modules/typescript/bin/tsc','-p','packages/contracts/tsconfig.json'],
 ['test-types-1','node_modules/typescript/bin/tsc','--noEmit','-p',`${dir}/test-types.json`],
 ['api-types-1','node_modules/typescript/bin/tsc','--noEmit','--incremental','false','-p','apps/api/tsconfig.json'],
 ['web-types-1','node_modules/typescript/bin/tsc','--noEmit','-p','apps/web/tsconfig.json'],
 ['lint-1','node_modules/eslint/bin/eslint.js','packages/contracts/src/teams.ts','packages/contracts/test/play-session-capacity.test.ts',dir],
];
for(const [label,...args] of commands){const result=spawnSync(process.execPath,[`${dir}/record.mjs`,label,process.execPath,...args],{stdio:'inherit',windowsHide:true});if(result.status!==0){process.exitCode=1;break;}}
