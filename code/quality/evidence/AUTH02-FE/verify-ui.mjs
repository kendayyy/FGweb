import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE';
for(const args of [
 ['e2e-10','node','node_modules/@playwright/test/cli.js','test','--config',`${dir}/playwright.config.ts`,'--headed'],
 ['regression-1','node','node_modules/vitest/vitest.mjs','run','--root','apps/web'],
 ['types-2','node','node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit'],
 ['test-types-1','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['lint-1','node','node_modules/eslint/bin/eslint.js','apps/web/src/features/auth','apps/web/src/App.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/auth-email.test.tsx','apps/web/test/auth.test.tsx','apps/web/test/codex-auth-ui-regressions.test.tsx','tests/e2e/auth-email.spec.ts',dir],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit',cwd:process.cwd()});
