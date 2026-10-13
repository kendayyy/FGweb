import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';
let resource=fs.readFileSync(d+'/supabase-test-resource27.mjs','utf8').replaceAll('resource27','resource28');fs.writeFileSync(d+'/supabase-test-resource28.mjs',resource,{flag:'wx'});
let run=fs.readFileSync(d+'/run-native61-resource1.mjs','utf8').replaceAll('14','15').replaceAll('27','28').replaceAll('native61-service-health','lifecycle-probe-service-health');
const from="[d+'/record.mjs','t30-native61-entry-review-1','node',d+'/enter-native61-reviewed1.mjs'],[d+'/record.mjs','headed-t30-native-61','node',d+'/run-native43-parent1.mjs']";
assert(run.includes(from));run=run.replace(from,"[d+'/record.mjs','t30-lifecycle-probe-entry-review-1','node',d+'/enter-lifecycle-red-probe-reviewed1.mjs'],[d+'/record.mjs','t30-lifecycle-red-probe-1','node',d+'/probe-lifecycle-red-reviewed1.mjs','canonical']");
fs.writeFileSync(d+'/run-lifecycle-probe-resource1.mjs',run,{flag:'wx'});
