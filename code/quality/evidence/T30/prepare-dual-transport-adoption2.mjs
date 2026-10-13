import fs from 'node:fs';
const d='quality/evidence/T30';
const old=fs.readFileSync(d+'/prepare-dual-transport-adoption1.mjs','utf8');
const before="assert.equal(candidate.split(missing).length,2);const corrected=candidate.replace(missing,'        localAudioTrack = undefined;\\n'+missing);";
const after="const missingIndex=candidate.lastIndexOf(missing);assert(missingIndex>0);const corrected=candidate.slice(0,missingIndex)+'        localAudioTrack = undefined;\\n'+candidate.slice(missingIndex);";
if(!old.includes(before))throw Error('Exact prepare correction anchor absent');
const code=old.replace(before,after);
fs.writeFileSync(d+'/prepare-dual-transport-adoption2-reviewed.mjs',code,{flag:'wx'});
await import('./prepare-dual-transport-adoption2-reviewed.mjs');
