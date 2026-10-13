import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='quality/evidence/T30',from=root+'/antigravity-implementation-final-1',to=root+'/antigravity-corrections-1';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert(!fs.existsSync(to));
const edits=[['review.json','apps/web/src/features/live/LiveViewer.tsx'],['media-review.json','apps/web/src/features/calls/media.ts']];
for(const [review]of edits){const r=JSON.parse(fs.readFileSync(root+'/codex-reviewed-corrections-1/'+review,'utf8'));assert.equal(hash(r.source),r.beforeSha256);assert.equal(hash(r.target),r.afterSha256);}
fs.mkdirSync(to);fs.cpSync(from+'/apps',to+'/apps',{recursive:true});
for(const [review,target]of edits){const r=JSON.parse(fs.readFileSync(root+'/codex-reviewed-corrections-1/'+review,'utf8'));fs.copyFileSync(r.target,to+'/'+target);assert.equal(hash(to+'/'+target),r.afterSha256);}
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);const files=walk(to);
fs.writeFileSync(to+'/exact-copy-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),executor:'Antigravity Gemini 3.6 Flash (High)',sourceProposal:from,reviewCorrections:edits.map(([review])=>root+'/codex-reviewed-corrections-1/'+review),files:files.map(path=>({path,sha256:hash(path)})),productionSourceWritten:false,assertionsChanged:false,applicationAcceptance:false},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(to+'/REVIEW.md','# T30 — exact reviewed corrections\n\nCopied the existing Antigravity proposal with exactly two Codex reviewed source corrections. Existing33 cases and assertions are preserved. The copy proof records source/file hashes. No application adoption, test execution, native/visual/benchmark result or PASS is claimed. Codex must review and validate next.\n',{flag:'wx'});
console.log(JSON.stringify({proposal:to,files:files.length,productionSourceWritten:false,assertionsChanged:false}));
