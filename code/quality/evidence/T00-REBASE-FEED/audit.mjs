import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-FEED',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
for(const [file,sha]of Object.entries(JSON.parse(fs.readFileSync(`${dir}/readonly.json`))))assert.equal(hash(file),sha,file);
const latest=new Map();for(const t of previous.tasks.filter(t=>t.status==='PASS'))for(const [file,sha]of Object.entries(t.outputsHash?.files??{}))latest.set(file,sha);
for(const [file,sha]of latest)if(!['quality/spec-baseline.json','scripts/verify-task.mjs'].includes(file))assert.equal(hash(file),sha.toLowerCase(),file);
for(const old of previous.tasks.filter(t=>t.status==='PASS')){
 const current=ledger.tasks.find(t=>t.id===old.id);assert.equal(current.status,'PASS');assert.deepEqual(current.outputsHash,old.outputsHash);assert.deepEqual(current.commands,old.commands);assert.deepEqual(current.evidencePaths,old.evidencePaths);
 for(const cmd of current.commands){assert.equal(cmd.exitCode,0);if(cmd.evidenceSha256)assert.equal(hash(cmd.evidencePath),cmd.evidenceSha256);}
 assert.equal(current.specSha256,baseline.hashes.specSha256);assert(current.baselineAdoptions?.some(a=>a.previousSpecSha256===old.specSha256&&a.reviewTask==='T00-REBASE-FEED'));
}
assert.equal(checkBaselines({root:process.cwd(),baseline}),6);
const ids=ledger.tasks.map(t=>t.id),start=ids.indexOf('T38');assert.deepEqual(ids.slice(start,start+5),['T38','T38-FEED-DATA','T38-FEED-BE','T38-FEED-FE','T39']);assert.deepEqual(ledger.tasks.find(t=>t.id==='T39').dependencies,['T38-FEED-FE']);
for(const id of ids.filter(id=>id.startsWith('T38-FEED-'))){const t=ledger.tasks.find(t=>t.id===id);assert.equal(t.status,'NOT_STARTED');assert.equal(t.outputsHash,null);assert.equal(t.commands.length,0);}
const oldTasks=previous.tasks.map(t=>t.id);assert.deepEqual(ids.filter(id=>oldTasks.includes(id)),oldTasks);
console.log(JSON.stringify({baselines:6,frozenFiles:latest.size,historicPassTasksUnchanged:previous.tasks.filter(t=>t.status==='PASS').length,newFeedTasks:3,feedImplemented:false,originalTaskOrderPreserved:true}));
