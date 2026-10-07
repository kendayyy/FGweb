import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as gate from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-FEED/fixtures',hash=b=>createHash('sha256').update(b).digest('hex');
const names={'specSha256':'01-product-spec.md','designSha256':'02-frontend-design.md','taskSha256':'task.md','mockupLobbySha256':'mockups/01-lobby-desktop-mobile.png','mockupCallSha256':'mockups/02-group-call-live.png','mockupFeedSha256':'mockups/03-community-feed-desktop-mobile.png'};
let n=0;
function fixture(){const root=path.resolve(dir,`case-${++n}`,'code'),docs=path.resolve(root,'../.doc'),baseline={hashes:{}};fs.mkdirSync(root,{recursive:true});for(const [key,name]of Object.entries(names)){const file=path.join(docs,name),bytes=Buffer.from(`unit fixture ${key}`);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);baseline.hashes[key]=hash(bytes);}return {root,docs,baseline};}
test('six approved baseline sources validate together',()=>{const f=fixture();assert.equal(gate.checkBaselines(f),6);});
for(const key of Object.keys(names))test(`modified ${key} is rejected`,()=>{const f=fixture();fs.appendFileSync(path.join(f.docs,names[key]),'tampered');assert.throws(()=>gate.checkBaselines(f),/baseline/);});
test('missing feed mockup hash cannot silently bypass the added source',()=>{const f=fixture();delete f.baseline.hashes.mockupFeedSha256;assert.throws(()=>gate.checkBaselines(f),/baseline/);});
test('existing gate still rejects failures, changed output, changed spec and broadened files',()=>{
 const f=fixture(),s=f.baseline.hashes.specSha256,now=new Date().toISOString();fs.writeFileSync(path.join(f.root,'source.txt'),'fixture source');fs.writeFileSync(path.join(f.root,'evidence.txt'),'fixture log');
 const previous={id:'previous',status:'PASS',specSha256:s,dependencies:[],writeAllowlist:['source.txt','evidence.txt'],outputsHash:{files:{'source.txt':hash('fixture source')}},commands:[{command:'unit fixture',exitCode:0,startedAt:now,completedAt:now,evidencePath:'evidence.txt',evidenceSha256:hash('fixture log')}],evidencePaths:['evidence.txt']};
 const target={id:'target',specSha256:s,dependencies:['previous'],writeAllowlist:['target.txt']},args={root:f.root,tasks:[previous,target],id:'target',specHash:s};
 assert.equal(gate.checkGate(args),target);assert.throws(()=>gate.checkGate({...args,requestedPaths:['unapproved.txt']}),/outside/);
 previous.commands[0].exitCode=1;assert.throws(()=>gate.checkGate(args),/failed/);previous.commands[0].exitCode=0;
 fs.writeFileSync(path.join(f.root,'source.txt'),'changed');assert.throws(()=>gate.checkGate(args),/hash/);fs.writeFileSync(path.join(f.root,'source.txt'),'fixture source');
 assert.throws(()=>gate.checkGate({...args,specHash:'wrong'}),/baseline/);previous.status='BLOCKED';assert.throws(()=>gate.checkGate(args),/prerequisite/);
});
