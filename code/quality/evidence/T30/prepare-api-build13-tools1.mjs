import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';
let snapshot=fs.readFileSync(d+'/snapshot-api-build12.mjs','utf8').replaceAll('before-12','before-13');fs.writeFileSync(d+'/snapshot-api-build13.mjs',snapshot,{flag:'wx'});
let adoption=fs.readFileSync(d+'/adopt-api-build-12-reviewed2.mjs','utf8').replaceAll('build-12','build-13');
const old='Actual nonincremental API build from reviewed lifecycle no-op write predicate after real source RED7/GREEN7; only predicate inside original awaited query changes, all other compiled bytes unchanged; no native acceptance claim';
assert(adoption.includes(old));adoption=adoption.replace(old,'Actual nonincremental API build from reviewed ordinary lifecycle coalescing after controlled current compiled real PG/private SFU burst RED; distinct ended events and original reconciliation body/authority/SQL locks retained, all other compiled bytes unchanged; fresh GREEN regressions and original native acceptance still required');
fs.writeFileSync(d+'/adopt-api-build-13-reviewed1.mjs',adoption,{flag:'wx'});
