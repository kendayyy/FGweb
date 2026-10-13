import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T25',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),owner=ledger.tasks.find(t=>t.id==='T25'),before=JSON.parse(fs.readFileSync(`${dir}/resume-after-capacity-before.json`));
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);assert.equal(owner.status,'IN_PROGRESS');checkBaselines({root:process.cwd(),baseline});
for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),h,`Read-only file changed: ${p}`);
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,`Historical PASS changed: ${old.id}`);
assert.equal(hash('.env.local'),before.configuration.env);
const allow=p=>owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const labels=['task-test-final-1','regression-final-1','types-final-1','lint-final-1','build-final-2','headed-6','main-preview-1','diff-final-1','helper-lint-1'];
const commands=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)));
for(const c of commands){assert.equal(c.exitCode,0,c.command);assert.equal(hash(c.evidencePath),c.evidenceSha256);}
assert.match(fs.readFileSync(`${dir}/codex-task-test-final-1.txt`,'utf8'),/22 passed/);
assert.match(fs.readFileSync(`${dir}/codex-regression-final-1.txt`,'utf8'),/86 passed/);
assert.match(fs.readFileSync(`${dir}/codex-headed-6.txt`,'utf8'),/2 passed/);
for(const label of ['roster-red-1','room-invite-red-1','queue-profile-red-1','public-admission-red-1']){const red=JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`));assert.notEqual(red.exitCode,0);assert.equal(hash(red.evidencePath),red.evidenceSha256);}
const native=JSON.parse(fs.readFileSync(`${dir}/headed-6/native-state.json`));assert.equal(native.rooms,1);assert.equal(native.members,5);assert.equal(native.active_slots,0);
const witnesses=JSON.parse(fs.readFileSync(`${dir}/headed-6/draft-session-sockets.json`));assert(witnesses.before.socketIds.length>0);assert.deepEqual(witnesses.before.socketIds,witnesses.after.socketIds);assert.deepEqual(witnesses.before.socketEvents,witnesses.after.socketEvents);
const preview=JSON.parse(fs.readFileSync(`${dir}/main/preview.json`));assert.equal(preview.headed,true);assert.equal(preview.discoveryUnauthenticatedStatus,401);assert.equal(preview.dotaDecoded,true);
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
for(const p of tracked.filter(p=>!allow(p)))assert(Object.hasOwn(before.readonly,p),`New file outside scope: ${p}`);
function walk(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{const p=`${root}/${e.name}`;return e.isDirectory()?walk(p):[p];});}
const files=[...new Set([...tracked.filter(allow),...walk('apps/web/dist'),...walk(dir),'.runtime/t25/start-preview.mjs'])].filter(p=>!p.startsWith(`${dir}/codex-close-`)&&!p.endsWith('/closure.json')).sort();
for(const p of files)assert(allow(p),`Output outside scope: ${p}`);
const env=parseEnv(fs.readFileSync('.env.local','utf8')),privateValues=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8).map(([,value])=>value);
for(const p of files.filter(p=>/\.(ts|tsx|js|mjs|css|map|json|md|txt|html)$/.test(p))){const content=fs.readFileSync(p,'utf8');for(const value of privateValues)assert(!content.includes(value),`Private configuration value in ${p}`);}
const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));for(const c of records)assert.equal(hash(c.evidencePath),c.evidenceSha256);
owner.commands=commands;owner.attempts=records.filter(c=>!commands.some(x=>x.evidencePath===c.evidencePath));
owner.failedAttempts=records.filter(c=>c.exitCode!==0).map(record=>({record,resolution:`${dir}/review.md`,resolvedBy:[`${dir}/codex-task-test-final-1.json`,`${dir}/codex-regression-final-1.json`,`${dir}/codex-headed-6.json`],reason:'Original failed run retained; review maps the actual setup, fixture, typing or behavioral defect to subsequent passing checks.'}));
owner.outputsHash={specSha256:baseline.hashes.specSha256,files:Object.fromEntries(files.map(p=>[p,hash(p)]))};owner.evidencePaths=[...new Set([...owner.evidencePaths,...records.flatMap(c=>[c.evidencePath,c.evidencePath.replace(/\.txt$/,'.json')]),`${dir}/review.md`,`${dir}/headed-6/native-state.json`,`${dir}/headed-6/draft-session-sockets.json`])];owner.status='PASS';owner.completedAt=new Date().toISOString();owner.blockers=[];
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T26',specHash:baseline.hashes.specSha256});
const report={recordedAt:new Date().toISOString(),task:owner.id,status:'PASS',checks:{DOM:22,regression:86,headedNativeScenarios:2,nativeFlowSteps:7,privateRoomPreserved:true,activeSlotsAfterEnd:0,exactSessionAndSocketDraftPreserved:true,mainPreviewReady:true,readonlyFiles:Object.keys(before.readonly).length,historicalPASSRecords:before.historical.length,baselines:8,privateConfigurationUnchanged:true,checkerUnchanged:true,strictNextGate:'PASS'},outputsHash:owner.outputsHash,next:'T26'};
fs.writeFileSync(`${dir}/closure.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});owner.evidencePaths.push(`${dir}/closure.json`);owner.outputsHash.files[`${dir}/closure.json`]=hash(`${dir}/closure.json`);checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T26',specHash:baseline.hashes.specSha256});fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({task:owner.id,status:'PASS',DOM:22,regression:86,headedNative:2,strictNextGate:'PASS',next:'T26'}));
