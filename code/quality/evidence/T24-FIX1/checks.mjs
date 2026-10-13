import {spawnSync} from 'node:child_process';
const dir='quality/evidence/T24-FIX1';
const checks=[
 ['api-types-1','node_modules/typescript/bin/tsc','--noEmit','--incremental','false','-p','apps/api/tsconfig.json'],
 ['test-types-1','node_modules/typescript/bin/tsc','--noEmit','-p',`${dir}/test-types.json`],
 ['build-1','node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'],
 ['lint-1','node_modules/eslint/bin/eslint.js','apps/api/src/modules/play-sessions/play-sessions.controller.ts','apps/api/src/modules/play-sessions/play-sessions.service.ts','apps/api/test/room-play-sessions.integration.spec.ts',dir],
 ['diff-1','--git','diff','--check','--','apps/api/src/modules/play-sessions/play-sessions.controller.ts','apps/api/src/modules/play-sessions/play-sessions.service.ts','apps/api/test/room-play-sessions.integration.spec.ts',dir],
];
for(const [label,...args] of checks){const cmd=args[0]==='--git'?'git':process.execPath;if(cmd==='git')args.shift();const result=spawnSync(process.execPath,[`${dir}/record.mjs`,label,cmd,...args],{stdio:'inherit',windowsHide:true});if(result.status!==0){process.exitCode=1;break;}}
