import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE',file='tests/e2e/auth-email.spec.ts';
fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll("getByLabel('Email')","getByLabel('Email',{exact:true})"));
for(const args of [
 ['e2e-13','node','node_modules/@playwright/test/cli.js','test','--config',`${dir}/playwright.config.ts`,'--headed'],
 ['regression-3','node','node_modules/vitest/vitest.mjs','run','--root','apps/web'],
 ['lint-2','node','node_modules/eslint/bin/eslint.js','apps/web/src/features/auth','apps/web/src/App.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/auth-email.test.tsx','apps/web/test/auth.test.tsx','apps/web/test/codex-auth-ui-regressions.test.tsx','tests/e2e/auth-email.spec.ts',dir],
 ['test-types-5','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
