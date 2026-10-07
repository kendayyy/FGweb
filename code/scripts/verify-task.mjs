import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { inside } from './check-env.mjs';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function allow(file,patterns){return patterns.some(p=>p.endsWith('/**')?file.startsWith(p.slice(0,-2)):file===p);}
export function checkBaselines({root,baseline}){
 const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png',mockupFeedSha256:'../.doc/mockups/03-community-feed-desktop-mobile.png'};
 for(const [key,file]of Object.entries(docs)){
  const expected=baseline.hashes?.[key];
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/i.test(expected)||hash(path.resolve(root,file)).toLowerCase()!==expected.toLowerCase())throw new Error('baseline changed or missing approved source');
 }
 return Object.keys(docs).length;
}
export function checkGate({root,tasks,id,specHash,requestedPaths=[]}){
 const index=tasks.findIndex(t=>t.id===id);if(index<0)throw new Error('unknown task');
 const target=tasks[index];if(target.specSha256.toLowerCase()!==specHash.toLowerCase())throw new Error('spec baseline changed');
 const previous=tasks.slice(0,index);
 if(previous.some(t=>t.status!=='PASS')||target.dependencies.some(d=>!previous.some(t=>t.id===d&&t.status==='PASS')))throw new Error('prerequisite not PASS');
 for(const file of requestedPaths){inside(root,file);if(!allow(file,target.writeAllowlist||[]))throw new Error('file outside task allowlist');}
 const latest=new Map();for(const t of previous)for(const [file,digest] of Object.entries(t.outputsHash?.files||{}))latest.set(file,{digest,task:t});
 for(const [file,{digest,task}] of latest){const location=inside(root,file);if(task.writeAllowlist&&!allow(file,task.writeAllowlist))throw new Error('output outside task allowlist');if(hash(location).toLowerCase()!==digest.toLowerCase())throw new Error('output hash changed');}
 for(const t of previous){
  if(t.specSha256.toLowerCase()!==specHash.toLowerCase())throw new Error('predecessor spec changed');
  if(!t.commands?.length||!t.evidencePaths?.length)throw new Error('missing evidence');
  for(const file of t.evidencePaths)if(!fs.existsSync(inside(root,file)))throw new Error('missing evidence file');
  for(const cmd of t.commands){if(t.writeAllowlist&&(!cmd.evidencePath||!cmd.evidenceSha256||!Number.isFinite(Date.parse(cmd.startedAt))||!Number.isFinite(Date.parse(cmd.completedAt))))throw new Error('incomplete command evidence');if(cmd.exitCode!==0)throw new Error('failed command');if(cmd.evidencePath){const file=inside(root,cmd.evidencePath);if(!fs.existsSync(file))throw new Error('missing command evidence');if(cmd.evidenceSha256&&hash(file)!==cmd.evidenceSha256)throw new Error('evidence hash changed');if(t.startedAt&&cmd.startedAt&&(Date.parse(cmd.startedAt)<Date.parse(t.startedAt)||Date.parse(cmd.completedAt)<Date.parse(cmd.startedAt)||Date.parse(cmd.completedAt)>Date.now()))throw new Error('stale evidence');}}
 }
 return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const root=process.cwd();const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));const specHash=hash('../.doc/01-product-spec.md');checkBaselines({root,baseline});checkGate({root,tasks:ledger.tasks,id:process.argv[2],specHash,requestedPaths:process.argv.slice(3)});console.log('PASS: task prerequisites, evidence, hashes and requested write scope (no status changed)');}catch{console.error('FAIL: task gate rejected; check prerequisites, baseline, evidence, hashes and allowlist');process.exitCode=1;}}
