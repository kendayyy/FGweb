import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const root='quality/evidence/LIGHT01-FE',dir=`${root}/compact`;
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const owner=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
checkBaselines({root:process.cwd(),baseline});
for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),h,`Read-only file changed: ${p}`);
for(const [p,h]of Object.entries(before.documents))assert.equal(hash(p),h,`Reviewed metadata changed: ${p}`);
for(const old of before.historical){const current=ledger.tasks.find(t=>t.id===old.id);for(const key of ['status','outputsHash','commands','evidencePaths'])assert.deepEqual(current[key],old[key],`Historical ${key} changed: ${old.id}`);}
assert.equal(hash('.env.local'),before.configuration.env);assert.equal(hash('.runtime/auth-admin/admin-input.env'),before.configuration.adminInput);
const allow=p=>['quality/tasks.json','quality/spec-baseline.json','quality/spec-coverage.md'].includes(p)||owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
for(const p of files)if(!allow(p))assert(p in before.readonly,`New file outside owner scope: ${p}`);
const labels=['compact-prepare-2','compact-edit-tests-1','compact-services-1','compact-green-unit-1','compact-types-1','compact-test-types-1','compact-build-1','compact-headed-2','compact-lint-1'];
const commands=labels.map(label=>JSON.parse(fs.readFileSync(`${root}/codex-${label}.json`)));
for(const command of commands){assert.equal(command.exitCode,0);assert.equal(hash(command.evidencePath),command.evidenceSha256);}
for(const label of ['compact-red-unit-1','compact-red-headed-2']){const record=JSON.parse(fs.readFileSync(`${root}/codex-${label}.json`));assert.equal(record.exitCode,1);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${root}/codex-compact-green-unit-1.txt`,'utf8').includes('19 passed'));
assert(fs.readFileSync(`${root}/codex-compact-headed-2.txt`,'utf8').includes('7 passed'));
const contrast=JSON.parse(fs.readFileSync(`${dir}/contrast.json`));assert.equal(contrast.length,16);
for(const item of contrast){assert.equal(item.failures.length,0);for(const control of item.controls){assert(control.focus>=3);if(item.mode==='light')assert(control.border>=3);}}
const screenshots=fs.readdirSync(`${dir}/screenshots`).filter(p=>p.endsWith('.png'));assert.equal(screenshots.length,20);
const privateEnv=parseEnv(fs.readFileSync('.env.local','utf8'));const privateInput=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
const secrets=Object.entries({...privateEnv,...privateInput}).filter(([key,value])=>/SECRET|PASSWORD|SMTP_USER|SMTP_FROM|ADMIN_EMAIL/.test(key)&&value.length>=8).map(([,v])=>v);
const newText=files.filter(p=>(p.startsWith(`${dir}/`)||p.includes(`${root}/codex-compact-`)||['prepare-compact.mjs','edit-compact-tests.mjs','review-compact.mjs'].some(name=>p===`${root}/${name}`))&&/\.(json|txt|md|mjs|ts|tsx|html|css)$/.test(p));
for(const p of newText){const text=fs.readFileSync(p,'utf8');for(const secret of secrets)assert(!text.includes(secret),`Private value in newly created evidence: ${p}`);}
let strictGate='PASS';try{checkGate({root:process.cwd(),tasks:ledger.tasks,id:owner.id,specHash:baseline.hashes.specSha256,requestedPaths:before.scope});}catch(error){strictGate=error.message;}
assert.equal(strictGate,'output hash changed','Unexpected strict gate blocker');
const report={recordedAt:new Date().toISOString(),task:owner.id,status:'BLOCKED',implementation:'COMPACT_TOGGLE_BUILT_AND_TECHNICALLY_VERIFIED',visualApproval:'User approved mockup and requested implementation; actual app delivered for review',checks:{unit:19,headedE2E:7,screenshots:20,textContrastMeasurements:contrast.reduce((n,x)=>n+x.measured,0),contrastFailures:0,lint:'PASS',types:'PASS',testTypes:'PASS',build:'PASS'},strictGate,ownerResumeAudit:{readonlyFiles:Object.keys(before.readonly).length,historicalStatusesAndOutputsUnchanged:true,configurationUnchanged:true,baselinesAligned:true,privateValuesLeaked:false},migration:'Fixed light/dark only; legacy system resolves and persists once; missing/invalid default dark',files:Object.fromEntries(before.scope.map(p=>[p,hash(p)])),screenshots:Object.fromEntries(screenshots.map(p=>[p,hash(`${dir}/screenshots/${p}`)])),commands,nextTaskOpened:false};
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
owner.commands.push(...commands);owner.evidencePaths.push(`${dir}/verification.json`,`${dir}/contrast.json`,`${dir}/review.md`,...commands.map(c=>c.evidencePath));
owner.blockers=['THEME-COMPACT-02 technically verified with19 DOM tests and7 headed real-service E2E; stock gate still rejects historical output hashes, which remain preserved. Actual local app delivered for visual review; no task after LIGHT01-FE opened.'];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:owner.id,status:owner.status,checks:report.checks,strictGate,readonlyFiles:report.ownerResumeAudit.readonlyFiles,privateValuesLeaked:false}));
