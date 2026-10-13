import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE',source=fs.readFileSync(`${dir}/membership-headed-source.mjs`,'utf8');
const old="  await navigate(a,'/crypto'); await openRoom(a); await openRoom(b);";
assert.equal(source.split(old).length,2);
fs.writeFileSync(`${dir}/headed-active-membership.mjs`,source.replace(old,"  // Keep the owner in the existing room: no route refresh or fixture metadata mutation.\n  await openRoom(b);"),{flag:'wx'});
console.log('Prepared active-room admission test without owner navigation refresh.');
