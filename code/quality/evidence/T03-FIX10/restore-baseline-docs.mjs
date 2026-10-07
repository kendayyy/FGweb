import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T03-FIX10',hash=b=>createHash('sha256').update(b).digest('hex');
const archived=JSON.parse(fs.readFileSync(`${dir}/doc-change/manifest.json`));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')).hashes;
const keys={'01-product-spec.md':'specSha256','02-frontend-design.md':'designSha256','task.md':'taskSha256'};
const records=archived.records.map(record=>{
 assert.equal(hash(fs.readFileSync(record.copy)),record.sha256,'Preserved archive must be intact');
 assert.equal(hash(fs.readFileSync(record.source)),record.sha256,'Concurrent document edit; preserve instead of overwriting');
 const name=record.source.split('/').at(-1);
 const original=execFileSync('git',['show',`dda2906:.doc/${name}`]);
 assert.equal(hash(original),baseline[keys[name]].toLowerCase(),'Restore exact approved bytes only');
 return {...record,original,restoredSha256:hash(original)};
});
// User asked “tiếp tục làm” after the concrete preserve-and-restore proposal.
// Announced the recommended route explicitly; retain all additions and mockups.
for(const record of records)fs.writeFileSync(record.source,record.original);
for(const record of records)assert.equal(hash(fs.readFileSync(record.source)),record.restoredSha256);
fs.writeFileSync(`${dir}/doc-restoration.json`,JSON.stringify({completedAt:new Date().toISOString(),authorization:'User requested continue after doc-baseline-proposal; recommended preserve-and-restore route stated explicitly',records:records.map(({original,...r})=>r),archivePreserved:true,baselineOrCheckerChanged:false,mockupsTouched:false},null,2)+'\n');
console.log('Three exact approved baseline hashes restored; full feed addition archive and new mockup remain intact.');
