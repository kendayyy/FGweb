import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE';
for(const args of [
 ['regression-5','node','node_modules/vitest/vitest.mjs','run','--root','apps/web','--maxWorkers','1'],
 ['types-5','node','node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit'],
 ['test-types-5','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['build-4','node','apps/web/node_modules/vite/bin/vite.js','build','apps/web','--config','apps/web/vite.config.ts'],
 ['e2e-14','node','node_modules/@playwright/test/cli.js','test','--config',`${dir}/playwright.config.ts`,'--headed'],
 ['lint-2','node','node_modules/eslint/bin/eslint.js','apps/web/src/features/auth','apps/web/src/App.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/auth-email.test.tsx','apps/web/test/auth.test.tsx','apps/web/test/codex-auth-ui-regressions.test.tsx','tests/e2e/auth-email.spec.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
