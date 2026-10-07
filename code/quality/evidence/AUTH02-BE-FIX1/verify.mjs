import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-BE-FIX1';
for(const args of [
 ['build-1','node','node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'],
 ['test-types-1','node','node_modules/typescript/bin/tsc','-p','quality/evidence/AUTH02-BE/test-types.json','--noEmit'],
 ['lint-1','node','node_modules/eslint/bin/eslint.js','apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-email.integration.spec.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
