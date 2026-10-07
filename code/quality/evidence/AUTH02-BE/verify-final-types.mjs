import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-BE';
for(const args of [
 ['test-types-3','node','node_modules/typescript/bin/tsc','-p',`${dir}/test-types.json`,'--noEmit'],
 ['lint-1','node','node_modules/eslint/bin/eslint.js','apps/api/src/modules/auth','apps/api/src/modules/profiles/profiles.service.ts','apps/api/test/auth-email.integration.spec.ts','apps/api/test/auth.integration.spec.ts',dir],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit',cwd:process.cwd()});
