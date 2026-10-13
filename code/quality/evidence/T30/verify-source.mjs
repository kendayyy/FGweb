import {spawnSync} from 'node:child_process';
const checks=[
 ['node_modules/typescript/bin/tsc','--noEmit','--project','apps/web/tsconfig.json'],
 ['node_modules/typescript/bin/tsc','--noEmit'],
 ['node_modules/eslint/bin/eslint.js','apps/web/src/features/live','apps/web/src/features/calls/media.ts','apps/web/src/features/calls/CallPanel.tsx','apps/web/test/live-viewer.test.tsx','tests/e2e/screen-share.spec.ts','quality/evidence/T30/run-native.mjs','quality/evidence/T30/playwright.config.ts','quality/evidence/T30/turn-tcp-shaper.mjs','quality/evidence/T30/fixture-server-shaped.mjs','quality/evidence/T30/private-gateway-shaped-fixture.mjs'],
];
for(const args of checks){const startedAt=new Date().toISOString();const result=spawnSync(process.execPath,args,{cwd:process.cwd(),windowsHide:true,stdio:'inherit',timeout:120000});console.log(JSON.stringify({command:['node',...args],startedAt,completedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,errorCode:result.error?.code}));if(result.status!==0){process.exitCode=result.status??1;break;}}
