import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import fs from 'node:fs';
const d='quality/evidence/T37',commands=[
 ['t37-api-session-types-1',['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json','--noEmit','--incremental','false']],
 ['t37-auth-session-race-green-1',['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config',d+'/jest-auth-race1.config.cjs','--runInBand']],
 ['t37-auth-regressions-1',[d+'/run-api-regressions2.mjs',d+'/regression-auth-email.integration.spec.ts',d+'/regression-auth-admin.integration.spec.ts']],
 ['t37-backend-final-2',['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand','apps/api/test/support.integration.spec.ts','apps/api/test/moderation.integration.spec.ts','apps/api/test/moderation-crypto.integration.spec.ts']],
 ['t37-native-media-ban-3',['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config',d+'/jest-native2.config.cjs','--runInBand']],
 ['t37-source-lint-4',JSON.parse(fs.readFileSync(d+'/codex-t37-source-lint-3.json')).command.split(' ').slice(1).concat(['apps/api/src/modules/auth/auth.service.ts',d+'/auth-session-race.integration.spec.ts'])],
 ['t37-api-build-1',[d+'/build-source-sandbox1.mjs','api']],
];
for(const[label,args]of commands){const result=spawnSync(process.execPath,[d+'/record.mjs',label,process.execPath,...args],{stdio:'inherit',windowsHide:true});const r=spawnSync(process.execPath,[d+'/journal-command1.mjs',label],{stdio:'inherit',windowsHide:true});assert.equal(r.status,0);assert.equal(result.status,0,label+' failed; stop dependent verification');}
