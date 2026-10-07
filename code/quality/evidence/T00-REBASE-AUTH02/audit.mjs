import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-AUTH02',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
for(const [f,h]of Object.entries(JSON.parse(fs.readFileSync(`${dir}/readonly.json`))))assert.equal(hash(f),h,f);
const wip={...JSON.parse(fs.readFileSync(`${dir}/suspended-contract-work.json`)),...JSON.parse(fs.readFileSync(`${dir}/derived-wip.json`)).files};for(const [f,h]of Object.entries(wip))assert.equal(hash(f),h,f);
const latest=new Map();for(const old of previous.tasks.filter(t=>t.status==='PASS')){
 const current=ledger.tasks.find(t=>t.id===old.id);assert.equal(current.status,'PASS');
 for(const field of ['outputsHash','commands','evidencePaths','startedAt','completedAt'])assert.deepEqual(current[field],old[field],`${old.id}/${field}`);
 for(const [f,h]of Object.entries(old.outputsHash?.files??{}))latest.set(f,h);
 for(const command of current.commands){assert.equal(command.exitCode,0);if(command.evidenceSha256)assert.equal(hash(command.evidencePath),command.evidenceSha256);}
 assert.equal(current.specSha256,baseline.hashes.specSha256);
}
for(const [f,h]of latest)if(!['quality/spec-baseline.json','scripts/verify-task.mjs'].includes(f)&&!(f in wip))assert.equal(hash(f),h.toLowerCase(),f);
assert.equal(checkBaselines({root:process.cwd(),baseline}),7);
for(const [name,file]of Object.entries({spec:'../.doc/01-product-spec.md',design:'../.doc/02-frontend-design.md',task:'../.doc/task.md',rootAgents:'../AGENTS.md',frontendRule:'../.agents/rules/04-frontend-design.md'}))assert.equal(hash(file),hash(`${dir}/${name}.md`));
const ids=ledger.tasks.map(t=>t.id),start=ids.indexOf('T03-FIX12');assert.deepEqual(ids.slice(start,start+6),['T03-FIX12','AUTH02-DATA','AUTH02-BE','AUTH02-FE','T24-FIX1','T25']);
for(const id of ['AUTH02-DATA','AUTH02-BE','AUTH02-FE']){const t=ledger.tasks.find(t=>t.id===id);assert.equal(t.status,'NOT_STARTED');assert.equal(t.outputsHash,null);assert.equal(t.commands.length,0);}
const oldIds=previous.tasks.map(t=>t.id);assert.deepEqual(ids.filter(id=>oldIds.includes(id)),oldIds);assert.equal(ledger.tasks.find(t=>t.id==='T03-FIX12').status,'BLOCKED');
const before=execFileSync('git',['show','HEAD:code/scripts/verify-task.mjs'],{encoding:'utf8'}).replaceAll('\r\n','\n'),after=fs.readFileSync('scripts/verify-task.mjs','utf8').replaceAll('\r\n','\n');
assert.equal(after,before.replace("mockupFeedSha256:'../.doc/mockups/03-community-feed-desktop-mobile.png'","mockupFeedSha256:'../.doc/mockups/03-community-feed-desktop-mobile.png',mockupAuthSha256:'../.doc/mockups/04-login-desktop-mobile.png'"),'Only mandatory seventh source added; no gate relaxation');
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(f=>f.startsWith(`${dir}/`)||['quality/spec-baseline.json','scripts/verify-task.mjs'].includes(f));
for(const f of files)assert(!secrets.some(s=>fs.readFileSync(f).includes(Buffer.from(s))),'Secret leak');
console.log(JSON.stringify({baselines:7,frozenFiles:latest.size,historicPassTasksUnchanged:previous.tasks.filter(t=>t.status==='PASS').length,suspendedContractFilesUnchanged:Object.keys(wip).length,newAuthTasks:3,authImplemented:false,originalTaskOrderPreserved:true,checkerOnlyAddsSource:true}));
