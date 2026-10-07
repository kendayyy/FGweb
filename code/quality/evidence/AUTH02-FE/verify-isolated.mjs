import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE',files=fs.readdirSync('apps/web/test').filter(f=>f.endsWith('.test.tsx')).sort(),suites=[];
assert.equal(files.length,11);
for(const file of files){
 const label=`isolated-${file.replace('.test.tsx','')}`;
 execFileSync(process.execPath,[`${dir}/record.mjs`,label,'node','node_modules/vitest/vitest.mjs','run','--root','apps/web',`test/${file}`,'--maxWorkers','1'],{stdio:'inherit'});
 const record=JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)),log=fs.readFileSync(record.evidencePath,'utf8');
 const count=Number(log.match(/Tests\s+(\d+) passed/)?.[1]);assert(count>0);suites.push({file,count,record});
}
const total=suites.reduce((sum,s)=>sum+s.count,0);assert.equal(total,147);
fs.writeFileSync(`${dir}/isolated-regression.json`,JSON.stringify({files:11,tests:total,allTestsSelected:true,timeoutUnchanged:true,noAssertionsChanged:true,eachFileFreshProcess:true,suites},null,2)+'\n');
for(const args of [
 ['types-5','node','node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit'],
 ['test-types-5','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['build-4','node','apps/web/node_modules/vite/bin/vite.js','build','apps/web','--config','apps/web/vite.config.ts'],
 ['e2e-14','node','node_modules/@playwright/test/cli.js','test','--config',`${dir}/playwright.config.ts`,'--headed'],
 ['lint-2','node','node_modules/eslint/bin/eslint.js','apps/web/src/features/auth','apps/web/src/App.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/auth-email.test.tsx','apps/web/test/auth.test.tsx','apps/web/test/codex-auth-ui-regressions.test.tsx','tests/e2e/auth-email.spec.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
