import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';const replacements=[['69608','69956'],['resource20','resource21'],['stop-20','stop-21'],['restore-20','restore-21'],['temporary-stop-6','temporary-stop-7'],['temporary-close6','temporary-close7'],['restore-6','restore-7'],['restoration6','restoration7'],['t30-api57-fixture-smoke-normal-2','t30-startup-fixture-smoke-normal-1'],['probe-api57-fixture2-normal.mjs','probe-startup-fixture1-normal.mjs']];
let script=fs.readFileSync(d+'/run-api57-cockpit-retry2.mjs','utf8');for(const [a,b]of replacements){assert(script.includes(a),a);script=script.replaceAll(a,b);}assert(!script.includes('resource20')&&!script.includes('69608'));
fs.writeFileSync(d+'/run-startup-smoke-resource1.mjs',script,{flag:'wx'});
fs.writeFileSync(d+'/supabase-test-resource21.mjs',fs.readFileSync(d+'/supabase-test-resource13.mjs','utf8').replaceAll('resource13','resource21'),{flag:'wx'});
console.log('Prepared authorized exact process close and resource restoration finally; no actions executed.');
