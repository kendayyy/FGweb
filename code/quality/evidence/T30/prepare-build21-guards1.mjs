import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30';
fs.writeFileSync(d+'/supabase-test-resource89.mjs',fs.readFileSync(d+'/supabase-test-resource87.mjs','utf8').replaceAll('resource87','resource89'),{flag:'wx'});
let driver=fs.readFileSync(d+'/run-build20-current-guards-resource1.mjs','utf8').replaceAll('resource87','resource89').replaceAll('stop-87','stop-89').replaceAll('restore-87','restore-89').replaceAll('build20','build21');
const start=driver.indexOf(" ['t30-auth-pool-reuse-green-1'");const end=driver.indexOf(" ['t30-lifecycle-room-read-lock-build21-green-1'");assert(start>0&&end>start);driver=driver.slice(0,start)+driver.slice(end);driver=driver.replace("d+'/probe-coalescing-build21-reviewed1.mjs'","d+'/probe-coalescing-build20-reviewed1.mjs'");
fs.writeFileSync(d+'/run-build21-current-guards-resource1.mjs',driver,{flag:'wx'});
console.log('Sequential remaining Build21 guards driver prepared, uses unused queued controls/probes with same predicates. No run yet.');
