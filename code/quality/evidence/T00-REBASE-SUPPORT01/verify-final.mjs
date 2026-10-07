import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T00-REBASE-SUPPORT01';
for(const args of [
 ['lint-1','node','node_modules/eslint/bin/eslint.js','scripts/verify-task.mjs',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
