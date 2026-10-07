import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE';
execFileSync(process.execPath,[`${dir}/prepare-closeout.mjs`],{stdio:'inherit'});
for(const args of [
 ['lint-3','node','node_modules/eslint/bin/eslint.js','apps/web/src/features/auth','apps/web/src/App.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/auth-email.test.tsx','apps/web/test/auth.test.tsx','apps/web/test/codex-auth-ui-regressions.test.tsx','tests/e2e/auth-email.spec.ts',dir],
 ['audit-2','node',`${dir}/audit.mjs`],
 ['diff-2','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
