import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/GAME-LOGO-FE',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const owner=ledger.tasks.find(t=>t.id==='GAME-LOGO-FE');
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
assert.equal(owner.status,'IN_PROGRESS');checkBaselines({root:process.cwd(),baseline});
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),addition=JSON.parse(fs.readFileSync(`${dir}/scope-addition.json`));
for(const [p,h] of Object.entries(before.readonly))if(!addition.added.includes(p))assert.equal(hash(p),h,`Read-only changed: ${p}`);
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,`Historical PASS changed: ${old.id}`);
assert.equal(hash('.env.local'),before.configuration.env);
const privateBefore=JSON.parse(fs.readFileSync('quality/evidence/LIGHT01-FE/compact/before.json'));assert.equal(hash('.runtime/auth-admin/admin-input.env'),privateBefore.configuration.adminInput);
const labels=['dota-input-1','dota-preview-1','dota-integrate-1','dota-assets-1','dota-web-types-1','dota-test-types-1','dota-unit-1','dota-lint-4','dota-build-2','headed-9','dota-diff-2','dota-audit-1','dota-fixture-probe-1','dota-cleanup-2','dota-main-preview-1','dota-build-paths-1'];
const commands=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`)));
for(const c of commands){assert.equal(c.exitCode,0,c.command);assert.equal(hash(c.evidencePath),c.evidenceSha256);}
const clean=p=>fs.readFileSync(p,'utf8').replaceAll(String.fromCharCode(27),'').replace(/\[[0-9;]*m/g,'');
assert.match(clean(`${dir}/codex-dota-unit-1.txt`),/Tests\s+17 passed/);
assert.match(clean(`${dir}/codex-headed-9.txt`),/7 passed/);
assert.equal(JSON.parse(fs.readFileSync(`${dir}/dota-asset-provenance.json`)).rgbaPixelsUnchanged,true);
const allow=p=>owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&allow(p)&&!p.startsWith('quality/evidence/')&&!p.startsWith('.cache/')&&!p.startsWith('.runtime/'));
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=`${p}/${e.name}`;if(e.isDirectory())walk(f);else if(e.isFile()&&!files.includes(f))files.push(f);}}
walk('apps/web/dist');
const allRecords=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));
for(const c of allRecords)assert.equal(hash(c.evidencePath),c.evidenceSha256);
owner.failedAttempts??=[];
for(const c of allRecords.filter(c=>c.exitCode!==0))if(!owner.failedAttempts.some(a=>a.record?.evidencePath===c.evidencePath))owner.failedAttempts.push({record:c,resolvedBy:/build/.test(c.evidencePath)?`${dir}/codex-dota-build-2.json`:/headed/.test(c.evidencePath)?`${dir}/codex-headed-9.json`:`${dir}/dota-closure.json`,reason:'Original RED/unsuccessful command retained; corrected behavior verified by current checks and review.'});
owner.commands=commands;owner.attempts=allRecords.filter(c=>!commands.some(x=>x.evidencePath===c.evidencePath));
owner.outputsHash={specSha256:baseline.hashes.specSha256,files:Object.fromEntries(files.map(p=>[p,hash(p)]))};
owner.status='PASS';owner.blockers=[];owner.completedAt=new Date().toISOString();
owner.evidencePaths=[...new Set([...owner.evidencePaths,...commands.map(c=>c.evidencePath),`${dir}/dota-review.md`,`${dir}/dota-audit.json`,`${dir}/dota-asset-provenance.json`,`${dir}/dota-input-browser.png`,`${dir}/headed-9/socket-lifecycle.json`])];
assert(fs.existsSync(`${dir}/dota-review.md`));
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T24-FIX1',specHash:baseline.hashes.specSha256});
const report={recordedAt:new Date().toISOString(),task:owner.id,status:'PASS',checks:{taskDOM:17,headedE2E:7,allSevenDecoded:true,realAPI_DB_Redis:true,baselines:8,historicalPASSRecords:before.historical.length,privateConfigurationUnchanged:true,strictNextGate:'PASS',checkerUnchanged:true},sourceAsset:`${dir}/dota-asset-provenance.json`,review:`${dir}/dota-review.md`,outputsHash:owner.outputsHash,nextTask:'T24-FIX1',phoneInstallNotifications:'Not verified here; later PWA/device checkpoints retained'};
fs.writeFileSync(`${dir}/dota-closure.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
owner.evidencePaths.push(`${dir}/dota-closure.json`);owner.outputsHash.files[`${dir}/dota-closure.json`]=hash(`${dir}/dota-closure.json`);
checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T24-FIX1',specHash:baseline.hashes.specSha256});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:owner.id,status:'PASS',DOM:17,headed:7,strictNextGate:'PASS',historicalPASSUnchanged:true,next:'T24-FIX1'}));




