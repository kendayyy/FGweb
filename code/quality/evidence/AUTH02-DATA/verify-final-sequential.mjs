import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-DATA';
for(const args of [
 ['contracts-3','node','node_modules/vitest/vitest.mjs','run','--root','packages/contracts'],
 ['build-3','node','node_modules/typescript/bin/tsc','-p','packages/contracts/tsconfig.json'],
 ['lint-2','node','node_modules/eslint/bin/eslint.js','packages/contracts/src/auth.ts','packages/contracts/src/profiles.ts','packages/contracts/src/index.ts','packages/contracts/test/auth-email.test.ts',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit',cwd:process.cwd()});
