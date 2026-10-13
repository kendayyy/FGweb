import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {checkGate} from '../../../scripts/verify-task.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const roots=[];
after(()=>{for(const root of roots){assert(path.resolve(root).startsWith(path.resolve('.runtime/chatcrypto-be')+path.sep));fs.rmSync(root,{recursive:true,force:true});}});
function fixture(){
 const root=path.resolve('.runtime/chatcrypto-be',`gate_${randomUUID()}`);roots.push(root);fs.mkdirSync(root,{recursive:true});
 const put=(p,v)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),v);return hash(v);};
 const from=put('old-spec.md','old spec'),to=put('new-spec.md','old spec\napproved addition');
 const now=new Date().toISOString(),logHash=put('evidence.txt','verified log');
 const old={id:'old',status:'PASS',specSha256:from,dependencies:[],writeAllowlist:['source.txt','evidence.txt'],outputsHash:{files:{'source.txt':put('source.txt','before')}},commands:[{command:'fixture',exitCode:0,startedAt:now,completedAt:now,evidencePath:'evidence.txt',evidenceSha256:logHash}],evidencePaths:['evidence.txt']};
 const target={id:'active',status:'IN_PROGRESS',specSha256:from,dependencies:['old'],writeAllowlist:['source.txt','requested.txt'],approvedScopeAmendments:[{paths:['source.txt'],source:'Persisted human Permission to broaden Write Scope or touch locked files'}]};
 const manifest={version:1,taskId:'active',approval:{text:'xác nhận',scope:'spec lineage and reviewed output ownership',approvedAt:now},historicalRows:[{id:'old',sha256:hash(JSON.stringify(old))}],transitions:[{from,to,beforePath:'old-spec.md',afterPath:'new-spec.md',affectedTaskIds:['old','active'],requiredEvidence:[{path:'evidence.txt',sha256:logHash}]}],outputTransitions:[{path:'source.txt',previousTaskId:'old',beforeSha256:old.outputsHash.files['source.txt'],afterSha256:put('source.txt','after'),requiredEvidence:[{path:'evidence.txt',sha256:logHash}]}]};
 const args={root,tasks:[old,target],id:'active',specHash:to};
 function pin(){target.gateRebaseline={version:1,manifestPath:'manifest.json',manifestSha256:put('manifest.json',JSON.stringify(manifest))};}
 manifest.outputTransitions[0].scopeSha256=hash(JSON.stringify(target.approvedScopeAmendments[0]));
 pin();return {root,put,old,target,manifest,args,pin};
}
test('approved spec lineage and exact output ownership preserve old PASS and permit active gate',()=>{const f=fixture(),prior=structuredClone(f.old);assert.equal(checkGate(f.args),f.target);assert.deepEqual(f.old,prior);});
test('manifest digest tamper rejects',()=>{const f=fixture();f.put('manifest.json','{}');assert.throws(()=>checkGate(f.args));});
test('missing lineage cannot accept old snapshots',()=>{const f=fixture();delete f.target.gateRebaseline;assert.throws(()=>checkGate(f.args));});
test('changed historical PASS row rejects even with original spec',()=>{const f=fixture();f.old.title='fabricated';assert.throws(()=>checkGate(f.args));});
test('changed historical command evidence rejects',()=>{const f=fixture();f.put('evidence.txt','tamper');assert.throws(()=>checkGate(f.args));});
test('unapproved after-spec bytes reject',()=>{const f=fixture();f.put('new-spec.md','unapproved');assert.throws(()=>checkGate(f.args));});
test('wrong original hash rejects',()=>{const f=fixture();f.manifest.transitions[0].from=hash('wrong');f.pin();assert.throws(()=>checkGate(f.args));});
test('incomplete or reordered chain rejects',()=>{const f=fixture();f.manifest.transitions.unshift({...f.manifest.transitions[0],from:hash('missing')});f.pin();assert.throws(()=>checkGate(f.args));});
test('unrelated affected-task declaration rejects',()=>{const f=fixture();f.manifest.transitions[0].affectedTaskIds=['elsewhere'];f.pin();assert.throws(()=>checkGate(f.args));});
test('missing required transition evidence rejects',()=>{const f=fixture();f.manifest.transitions[0].requiredEvidence=[];f.pin();assert.throws(()=>checkGate(f.args));});
test('missing required output evidence rejects',()=>{const f=fixture();f.manifest.outputTransitions[0].requiredEvidence=[];f.pin();assert.throws(()=>checkGate(f.args));});
test('new unreviewed output mutation rejects',()=>{const f=fixture();f.put('source.txt','later unreviewed change');assert.throws(()=>checkGate(f.args));});
test('output transition without approved ownership rejects',()=>{const f=fixture();f.target.approvedScopeAmendments=[];assert.throws(()=>checkGate(f.args));});
test('wrong prior output owner rejects',()=>{const f=fixture();f.manifest.outputTransitions[0].previousTaskId='other';f.pin();assert.throws(()=>checkGate(f.args));});
test('scope still rejects unapproved writes',()=>{const f=fixture();assert.throws(()=>checkGate({...f.args,requestedPaths:['outside.txt']}));});
test('dependency gate still rejects incomplete predecessors',()=>{const f=fixture();f.target.dependencies.push('missing');assert.throws(()=>checkGate(f.args));});
test('cross-task reuse of approval rejects',()=>{const f=fixture();f.manifest.taskId='other';f.pin();assert.throws(()=>checkGate(f.args));});
test('valid two-step lineage preserves each original snapshot',()=>{const f=fixture(),first=f.manifest.transitions[0],middle=f.put('middle-spec.md','intermediate approved spec');f.manifest.transitions=[{...first,to:middle,afterPath:'middle-spec.md'},{...first,from:middle,beforePath:'middle-spec.md'}];f.pin();assert.equal(checkGate(f.args),f.target);});
test('missing approval rejects even when manifest is pinned',()=>{const f=fixture();delete f.manifest.approval;f.pin();assert.throws(()=>checkGate(f.args));});
test('manifest path cannot escape owning code root',()=>{const f=fixture();f.target.gateRebaseline.manifestPath='../outside.json';assert.throws(()=>checkGate(f.args),/outside/);});
test('failed command cannot become valid through a reviewed snapshot',()=>{const f=fixture();f.old.commands[0].exitCode=1;f.manifest.historicalRows[0].sha256=hash(JSON.stringify(f.old));f.pin();assert.throws(()=>checkGate(f.args),/failed command/);});
test('historical output outside its original scope remains rejected',()=>{const f=fixture();f.old.writeAllowlist=['evidence.txt'];f.manifest.historicalRows[0].sha256=hash(JSON.stringify(f.old));f.pin();assert.throws(()=>checkGate(f.args),/output outside/);});
