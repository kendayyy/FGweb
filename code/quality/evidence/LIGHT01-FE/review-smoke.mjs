import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/LIGHT01-FE',out=`${dir}/smoke`;
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(`${out}/before.json`));
const history=JSON.parse(fs.readFileSync(`${out}/history-adoption.json`));
assert.equal(history.beforeTaskSha256,before.documents['../.doc/task.md']);
assert.equal(history.beforeCodeAgentsSha256,before.readonly['AGENTS.md']);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const owner=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
checkBaselines({root:process.cwd(),baseline});
for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),p==='AGENTS.md'?history.codeAgentsSha256:h,`Read-only file changed: ${p}`);
for(const [p,h]of Object.entries(before.documents))assert.equal(hash(p),p==='../.doc/task.md'?history.taskSha256:h,`Approved source changed during implementation: ${p}`);
const old=JSON.parse(fs.readFileSync(`${out}/previous-ledger.json`));
for(const previous of old.tasks.filter(t=>t.status==='PASS')){
 const current=ledger.tasks.find(t=>t.id===previous.id);
 for(const key of ['status','outputsHash','commands','evidencePaths'])assert.deepEqual(current[key],previous[key],`Historical ${key} changed: ${previous.id}`);
}
const allow=p=>['quality/tasks.json','quality/spec-baseline.json','quality/spec-coverage.md'].includes(p)||owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
for(const p of files)if(!allow(p))assert(p in before.readonly,`New file outside owner scope: ${p}`);
assert.equal(hash('.env.local'),before.configuration.env);assert.equal(hash('.runtime/auth-admin/admin-input.env'),before.configuration.adminInput);
const approval=JSON.parse(fs.readFileSync(`${dir}/switcher-concepts/theme-approval.json`));
for(const mode of ['light','dark'])assert.equal(hash(approval[mode].file),approval[mode].sha256);
const records=['smoke-green-unit-1','smoke-types-1','smoke-test-types-1','smoke-build-1','smoke-headed-1','smoke-lint-1','smoke-regression-suite-1',...Array.from({length:13},(_,i)=>`smoke-regression-${i+1}`)].map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
let tests=0;for(let i=1;i<=13;i++){
 const log=fs.readFileSync(`${dir}/codex-smoke-regression-${i}.txt`,'utf8').replaceAll(String.fromCharCode(27),'').replace(/\[[0-9;]*m/g,'');
 const count=log.match(/Tests\s+(\d+) passed/);assert(count,`Missing successful test count: ${i}`);tests+=Number(count[1]);
}
const contrast=JSON.parse(fs.readFileSync(`${out}/contrast.json`));
assert.equal(contrast.length,16);for(const x of contrast){assert.equal(x.failures.length,0);for(const y of x.controls){assert(y.focus>=3);if(x.mode==='light')assert(y.border>=3);}}
let strictGate='';try{checkGate({root:process.cwd(),tasks:ledger.tasks,id:owner.id,specHash:hash('../.doc/01-product-spec.md')});}catch(error){strictGate=error.message;}
const env=parseEnv(fs.readFileSync('.env.local','utf8')),admin=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
const sensitive=[...Object.entries(env).filter(([key])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)).map(([,v])=>v),...Object.values(admin)].filter(v=>v&&v.length>=8);
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
for(const p of [...walk(out),...walk('apps/web/dist'),...files.filter(p=>p.startsWith('apps/web/src/')&&allow(p))])assert(!sensitive.some(v=>fs.readFileSync(p).includes(Buffer.from(v))),'Private value leak; details omitted');
const sources=['apps/web/src/components/ui/classic.tsx','apps/web/src/features/theme/ThemeSwitcher.tsx','apps/web/src/features/theme/theme.css','apps/web/src/styles/tokens.css','apps/web/src/styles/global.css','apps/web/src/features/lobby/lobby.css','apps/web/test/theme.test.tsx','tests/e2e/theme.spec.ts'];
const report={taskId:owner.id,recordedAt:new Date().toISOString(),status:'BLOCKED',implementation:'BUILT_AND_TECHNICALLY_VERIFIED',baselineAligned:true,strictGate,ownerResumeAudit:{readonlyFiles:Object.keys(before.readonly).length,frozenOutsideOwner:before.frozenOutsideOwner,historicalResultsPreserved:true},checks:{webTests:tests,testFiles:13,headedE2E:6,renderedTextContrastChecks:contrast.reduce((sum,x)=>sum+x.measured,0),focusContrastMin:Math.min(...contrast.flatMap(x=>x.controls.map(y=>y.focus))),lightControlBorderContrastMin:Math.min(...contrast.filter(x=>x.mode==='light').flatMap(x=>x.controls.map(y=>y.border))),screenshots:walk(`${out}/screenshots`).filter(p=>p.endsWith('.png')).length,lint:true,typecheck:true,build:true},files:Object.fromEntries(sources.map(p=>[p,hash(p)])),commands:records,limitations:['Actual new app appearance review is pending; approved mockups alone do not close task','Strict gate still compares superseded predecessor output hashes inside the current authorized owner scope; checker and historical hashes not changed','Logo and fixed72px sidebar integration remains a later owner checkpoint'],origin:'http://localhost:18080/',configurationAndAdminInputPreserved:true,privateValuesLeaked:false};
fs.writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
owner.status='BLOCKED';owner.blockers=report.limitations.slice(0,2);
for(const p of [`${out}/verification.json`,...records.map(r=>r.evidencePath)])if(!owner.evidencePaths.includes(p))owner.evidencePaths.push(p);
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({status:report.status,implementation:report.implementation,checks:report.checks,baselineAligned:true,strictGate,readonlyFiles:report.ownerResumeAudit.readonlyFiles,privateValuesLeaked:false}));
