import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T00-REBASE-SUPPORT01';
for(const args of [
 ['checker-1','node','--test',`${dir}/baseline-gate.test.mjs`],
 ['gate-2','node','scripts/verify-task.mjs','T00-REBASE-SUPPORT01','quality/spec-baseline.json','scripts/verify-task.mjs'],
 ['lint-1','node','node_modules/eslint/bin/eslint.js','scripts/verify-task.mjs',dir],
 ['audit-1','node',`${dir}/audit.mjs`],
 ['diff-1','git','diff','--check'],
])execFileSync(process.execPath,[`${dir}/record.mjs`,...args],{stdio:'inherit'});
