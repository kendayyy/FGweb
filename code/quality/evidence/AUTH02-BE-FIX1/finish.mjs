import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-BE-FIX1';
for(const args of [
 ['lint-2','node','node_modules/eslint/bin/eslint.js','apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-email.integration.spec.ts',dir],
 ['audit-2','node',`${dir}/audit.mjs`],
 ['diff-2','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
execFileSync(process.execPath,[`${dir}/closeout.mjs`],{stdio:'inherit'});
