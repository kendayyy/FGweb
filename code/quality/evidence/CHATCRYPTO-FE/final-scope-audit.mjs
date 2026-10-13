import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=p=>digest(fs.readFileSync(p));
const before=JSON.parse(fs.readFileSync(dir+'/before.json','utf8'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));
const current=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');
const manifest=JSON.parse(fs.readFileSync(current.gateRebaseline.manifestPath,'utf8'));
assert.equal(hash(current.gateRebaseline.manifestPath),current.gateRebaseline.manifestSha256);
const transitions=new Map(manifest.outputTransitions.map(t=>[t.path,t]));
const allowed=current.writeAllowlist.map(p=>p.endsWith('/**')?f=>f.startsWith(p.slice(0,-2)):f=>f===p);
const changed=[],missing=[];
for(const [file,sha]of Object.entries(before.readonly)){
  if(!fs.existsSync(file)){missing.push(file);continue;}
  const now=hash(file);if(now!==sha){const t=transitions.get(file);changed.push({file,beforeSha256:sha,afterSha256:now,allowed:allowed.some(fn=>fn(file)),reviewedTransition:!!t,transitionMatchesCurrent:t?.afterSha256===now});}
}
assert.equal(hash('scripts/verify-task.mjs'),before.checkerSha256);
const env=before.configuration.env;
assert.equal(hash('.env.local'),env);
const historical=before.historical;
const rows=Array.isArray(historical)?historical:Object.values(historical);
const historicalChecks=rows.map(old=>{const now=ledger.tasks.find(t=>t.id===old.id);assert(now);assert.equal(digest(JSON.stringify(now)),digest(JSON.stringify(old)));return old.id;});
const records=fs.readdirSync(dir).filter(n=>/^codex-.+\.json$/.test(n));
for(const n of records){const r=JSON.parse(fs.readFileSync(dir+'/'+n,'utf8'));assert.equal(hash(r.evidencePath),r.evidenceSha256);}
const fixture=JSON.parse(fs.readFileSync(dir+'/stale-sync-fixture-proposal.json','utf8'));
const proposalUnapplied=hash(fixture.file)===fixture.beforeSha256;
const output={recordedAt:new Date().toISOString(),task:current.id,status:current.status,readonlyCompared:Object.keys(before.readonly).length,changed,missing,historicalChecks,checkerUnchanged:true,envUnchanged:true,finishedCommandRecordsVerified:records.length,contractsScopeProposalUnapplied:proposalUnapplied,mainMutation:false,frontendComplete:false};
fs.writeFileSync(dir+'/final-scope-audit-1.json',JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...output,changed:changed.map(x=>({file:x.file,allowed:x.allowed,reviewedTransition:x.reviewedTransition,transitionMatchesCurrent:x.transitionMatchesCurrent})),historicalChecks:historicalChecks.length}));
