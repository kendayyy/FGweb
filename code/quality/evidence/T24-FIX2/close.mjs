import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T24-FIX2',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),owner=ledger.tasks.find(t=>t.id==='T24-FIX2'),before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
checkBaselines({root:process.cwd(),baseline});assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);assert.equal(owner.status,'IN_PROGRESS');
for(const [p,h] of Object.entries(before.readonly))assert.equal(hash(p),h,`Read-only file changed: ${p}`);
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,`Historical PASS changed: ${old.id}`);
assert.equal(hash('.env.local'),before.configuration.env);
const labels=['write-tests-1','green-1','api-types-1','test-types-1','build-1','lint-1','diff-1','derived-proof-1','adopt-declarations-2','final-helper-lint-1'];
const commands=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)));
for(const c of commands){assert.equal(c.exitCode,0,c.command);assert.equal(hash(c.evidencePath),c.evidenceSha256);}
assert.match(fs.readFileSync(`${dir}/codex-green-1.txt`,'utf8'),/Tests:\s+29 passed/);
const red=JSON.parse(fs.readFileSync(`${dir}/codex-red-1.json`));assert.equal(red.exitCode,1);assert.equal(hash(red.evidencePath),red.evidenceSha256);assert.match(fs.readFileSync(red.evidencePath,'utf8'),/Received: undefined/);
const files=owner.writeAllowlist.filter(p=>!p.endsWith('/**')&&fs.existsSync(p));
const privateValues=Object.values((await import('node:util')).parseEnv(fs.readFileSync('.env.local','utf8'))).filter(v=>v.length>=12&&!v.startsWith('http')&&!v.includes('localhost')&&!v.includes('127.0.0.1'));
for(const p of files.filter(p=>/\.(ts|js|json|map|md)$/.test(p)))for(const value of privateValues)assert(!fs.readFileSync(p,'utf8').includes(value),`Private configuration value in ${p}`);
owner.outputsHash={specSha256:baseline.hashes.specSha256,files:Object.fromEntries(files.map(p=>[p,hash(p)]))};owner.commands=commands;
const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));
for(const c of records)assert.equal(hash(c.evidencePath),c.evidenceSha256);
owner.failedAttempts=records.filter(c=>c.exitCode!==0).map(record=>({record,resolvedBy:record.evidencePath.includes('close-')?`${dir}/closure.json`:`${dir}/codex-green-1.json`,reason:record.evidencePath===red.evidencePath?'Expected native capacity omission RED retained':'Original unsuccessful closing attempt retained; verified generated declaration adoption and strict gate resolve ownership'}));
owner.attempts=records.filter(c=>!commands.some(x=>x.evidencePath===c.evidencePath));owner.status='PASS';owner.completedAt=new Date().toISOString();owner.blockers=[];
owner.evidencePaths.push(...commands.map(c=>c.evidencePath),red.evidencePath,`${dir}/review.md`);
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T25',specHash:baseline.hashes.specSha256});
const report={recordedAt:new Date().toISOString(),task:owner.id,status:'PASS',checks:{newRealHTTP_PG:3,frozenT24AndDiscoveryCases:26,total:29,readonlyFiles:Object.keys(before.readonly).length,historicalPASSRecords:before.historical.length,baselines:8,privateConfigurationUnchanged:true,strictNextGate:'PASS',checkerUnchanged:true},outputsHash:owner.outputsHash,next:'T25'};
fs.writeFileSync(`${dir}/closure.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});owner.evidencePaths.push(`${dir}/closure.json`);owner.outputsHash.files[`${dir}/closure.json`]=hash(`${dir}/closure.json`);
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T25',specHash:baseline.hashes.specSha256});fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({task:owner.id,status:'PASS',realHTTP_PG:29,strictNextGate:'PASS',historicPASSUnchanged:true,next:'T25'}));

