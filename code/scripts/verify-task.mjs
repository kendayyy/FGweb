import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { inside } from './check-env.mjs';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function allow(file,patterns){return patterns.some(p=>p.endsWith('/**')?file.startsWith(p.slice(0,-2)):file===p);}
function reviewedRebaseline({root,target,previous,specHash}){
 const pin=target.gateRebaseline;
 if(!pin)return null;
 const fail=()=>{throw new Error('invalid approved gate lineage');};
 const digest=v=>createHash('sha256').update(v).digest('hex');
 const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(pin.version!==1||!validHash(pin.manifestSha256))fail();
 const file=inside(root,pin.manifestPath);if(hash(file)!==pin.manifestSha256)fail();
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 if(manifest.version!==1||manifest.taskId!==target.id||!manifest.approval?.text||!manifest.approval.scope||!Number.isFinite(Date.parse(manifest.approval.approvedAt))||Date.parse(manifest.approval.approvedAt)>Date.now())fail();
 if(!Array.isArray(manifest.historicalRows)||manifest.historicalRows.length!==previous.length)fail();
 previous.forEach((row,i)=>{const frozen=manifest.historicalRows[i];if(frozen.id!==row.id||frozen.sha256!==digest(JSON.stringify(row)))fail();});
 function evidence(items){
  if(!Array.isArray(items)||!items.length)fail();
  for(const item of items){if(!validHash(item.sha256)||hash(inside(root,item.path))!==item.sha256)fail();}
 }
 const chain=manifest.transitions;
 if(!Array.isArray(chain)||!chain.length)fail();
 const seen=new Set();
 chain.forEach((step,i)=>{
  if(!validHash(step.from)||!validHash(step.to)||step.from===step.to||seen.has(step.from)||seen.has(step.to)||!Array.isArray(step.affectedTaskIds)||new Set(step.affectedTaskIds).size!==step.affectedTaskIds.length)fail();
  if(i&&chain[i-1].to!==step.from)fail();
  if(hash(inside(root,step.beforePath))!==step.from||hash(inside(root,step.afterPath))!==step.to)fail();
  evidence(step.requiredEvidence);seen.add(step.from);
 });
 if(chain.at(-1).to!==specHash.toLowerCase())fail();
 const accepts=row=>{
  let value=row.specSha256.toLowerCase();if(value===specHash.toLowerCase())return true;
  const start=chain.findIndex(step=>step.from===value);if(start<0)return false;
  for(const step of chain.slice(start)){if(step.from!==value||!step.affectedTaskIds.includes(row.id))return false;value=step.to;}
  return value===specHash.toLowerCase();
 };
 if(![...previous,target].every(accepts))fail();
 const latest=new Map();for(const row of previous)for(const [p,digest]of Object.entries(row.outputsHash?.files||{}))latest.set(p,{digest,task:row});
 const outputs=new Map();if(!Array.isArray(manifest.outputTransitions))fail();
 for(const item of manifest.outputTransitions){
  const prior=latest.get(item.path);
  if(outputs.has(item.path)||!prior||prior.task.id!==item.previousTaskId||prior.digest!==item.beforeSha256||!validHash(item.afterSha256)||hash(inside(root,item.path))!==item.afterSha256)fail();
  if(!allow(item.path,target.writeAllowlist||[])||!target.approvedScopeAmendments?.some(amendment=>typeof amendment.source==='string'&&amendment.source.length>0&&digest(JSON.stringify(amendment))===item.scopeSha256&&allow(item.path,amendment.paths||[])))fail();
  evidence(item.requiredEvidence);outputs.set(item.path,item);
 }
 return {accepts,outputs};
}
export function checkBaselines({root,baseline}){
 const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png',mockupFeedSha256:'../.doc/mockups/03-community-feed-desktop-mobile.png',mockupAuthSha256:'../.doc/mockups/04-login-desktop-mobile.png',mockupAdminSha256:'../.doc/mockups/05-admin-support-desktop.png'};
 for(const [key,file]of Object.entries(docs)){
  const expected=baseline.hashes?.[key];
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/i.test(expected)||hash(path.resolve(root,file)).toLowerCase()!==expected.toLowerCase())throw new Error('baseline changed or missing approved source');
 }
 return Object.keys(docs).length;
}
export function checkGate({root,tasks,id,specHash,requestedPaths=[]}){
 const index=tasks.findIndex(t=>t.id===id);if(index<0)throw new Error('unknown task');
 const target=tasks[index];
 const previous=tasks.slice(0,index);
 const reviewed=reviewedRebaseline({root,target,previous,specHash});
 if(target.specSha256.toLowerCase()!==specHash.toLowerCase()&&!reviewed?.accepts(target))throw new Error('spec baseline changed');
 if(previous.some(t=>t.status!=='PASS')||target.dependencies.some(d=>!previous.some(t=>t.id===d&&t.status==='PASS')))throw new Error('prerequisite not PASS');
 for(const file of requestedPaths){inside(root,file);if(!allow(file,target.writeAllowlist||[]))throw new Error('file outside task allowlist');}
 const latest=new Map();for(const t of previous)for(const [file,digest] of Object.entries(t.outputsHash?.files||{}))latest.set(file,{digest,task:t});
 for(const [file,{digest,task}] of latest){const location=inside(root,file);if(task.writeAllowlist&&!allow(file,task.writeAllowlist))throw new Error('output outside task allowlist');if(hash(location).toLowerCase()!==digest.toLowerCase()&&!reviewed?.outputs.has(file))throw new Error('output hash changed');}
 for(const t of previous){
  if(t.specSha256.toLowerCase()!==specHash.toLowerCase()&&!reviewed?.accepts(t))throw new Error('predecessor spec changed');
  if(!t.commands?.length||!t.evidencePaths?.length)throw new Error('missing evidence');
  for(const file of t.evidencePaths)if(!fs.existsSync(inside(root,file)))throw new Error('missing evidence file');
  for(const cmd of t.commands){if(t.writeAllowlist&&(!cmd.evidencePath||!cmd.evidenceSha256||!Number.isFinite(Date.parse(cmd.startedAt))||!Number.isFinite(Date.parse(cmd.completedAt))))throw new Error('incomplete command evidence');if(cmd.exitCode!==0)throw new Error('failed command');if(cmd.evidencePath){const file=inside(root,cmd.evidencePath);if(!fs.existsSync(file))throw new Error('missing command evidence');if(cmd.evidenceSha256&&hash(file)!==cmd.evidenceSha256)throw new Error('evidence hash changed');if(t.startedAt&&cmd.startedAt&&(Date.parse(cmd.startedAt)<Date.parse(t.startedAt)||Date.parse(cmd.completedAt)<Date.parse(cmd.startedAt)||Date.parse(cmd.completedAt)>Date.now()))throw new Error('stale evidence');}}
 }
 return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const root=process.cwd();const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));const specHash=hash('../.doc/01-product-spec.md');checkBaselines({root,baseline});checkGate({root,tasks:ledger.tasks,id:process.argv[2],specHash,requestedPaths:process.argv.slice(3)});console.log('PASS: task prerequisites, evidence, hashes and requested write scope (no status changed)');}catch{console.error('FAIL: task gate rejected; check prerequisites, baseline, evidence, hashes and allowlist');process.exitCode=1;}}
