import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-LIGHT01',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const old=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
for(const [f,h]of Object.entries(JSON.parse(fs.readFileSync(`${dir}/readonly.json`))))assert.equal(hash(f),h,f);
const suspended={...JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-AUTH02/suspended-contract-work.json')),...JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-AUTH02/derived-wip.json')).files};
const owned=ledger.tasks.find(t=>t.id==='T03-FIX12').writeAllowlist,allow=f=>owned.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):p===f);
for(const [f,h]of Object.entries(suspended).filter(([f])=>f.startsWith('packages/contracts/')||f==='quality/api-contract.md'))assert.equal(hash(f),h,f);
const latest=new Map();for(const t of old.tasks.filter(t=>t.status==='PASS')){const current=ledger.tasks.find(c=>c.id===t.id);for(const field of ['status','commands','outputsHash','evidencePaths','startedAt','completedAt'])assert.deepEqual(current[field],t[field],`${t.id}/${field}`);for(const [f,h]of Object.entries(t.outputsHash?.files??{}))latest.set(f,h);for(const r of t.commands){assert.equal(r.exitCode,0);if(r.evidenceSha256)assert.equal(hash(r.evidencePath),r.evidenceSha256);}}
for(const [f,h]of latest)if(f!=='quality/spec-baseline.json'&&!allow(f))assert.equal(hash(f),h,f);
const before=JSON.parse(fs.readFileSync(`${dir}/previous-baseline.json`));for(const [key,h]of Object.entries(before.hashes))if(key.startsWith('mockup'))assert.equal(baseline.hashes[key],h);
assert.equal(checkBaselines({root:process.cwd(),baseline}),7);
for(const [key,file]of Object.entries({specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'}))assert.equal(hash(file),hash(`${dir}/${key}.md`));
const ids=ledger.tasks.map(t=>t.id),start=ids.indexOf('T03-FIX12');assert.deepEqual(ids.slice(start,start+7),['T03-FIX12','AUTH02-DATA','AUTH02-BE','AUTH02-FE','LIGHT01-FE','T24-FIX1','T25']);assert.equal(ledger.tasks.find(t=>t.id==='LIGHT01-FE').status,'NOT_STARTED');
console.log(JSON.stringify({baselines:7,codeAndWipUnchanged:true,historicalPassUnchanged:true,checkerUnchanged:true,newCheckpoint:'LIGHT01-FE',themeImplemented:false,visualLightApproved:false}));
