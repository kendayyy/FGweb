import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T31';
for(const stem of ['build-source-sandbox','prepare-built-adoption']){const original=fs.readFileSync(d+'/'+stem+'1.mjs','utf8'),next=original.replaceAll('build1','build2').replaceAll('-compiled-before-','-compiled2-before-');assert.notEqual(next,original);fs.writeFileSync(d+'/'+stem+'2.mjs',next,{flag:'wx'});}console.log('Prepared new immutable build2 paths; no old build source/evidence changed.');
