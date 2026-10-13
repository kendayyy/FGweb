import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {captureUiStep,drainDemoStream} from './demo-stream.mjs';
import {loadDemo,demoSummary} from './demo.mjs';
async function fixture(fn){
 await mkdir('.runtime/telegram-bridge-tests',{recursive:true});const root=await mkdtemp(path.resolve('.runtime/telegram-bridge-tests/stream-'));
 try{await mkdir(path.join(root,'quality/evidence'),{recursive:true});await writeFile(path.join(root,'quality/tasks.json'),JSON.stringify({tasks:[{id:'TEST',status:'IN_PROGRESS'}]}));await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
const opts=step=>({task:'TEST',runId:'actual-run',step,title:'UI test',action:'Open demo',result:'Observed app',startedAt:new Date(Date.now()-10000).toISOString(),headed:true,privacySafe:true});
const page={locator:s=>({selector:s}),screenshot:async options=>{assert.equal(options.fullPage,false);assert.ok(options.mask.length);return Buffer.from([137,80,78,71,13,10,26,10,0]);}};
test('multiple incremental steps delivered in order once; latest stays running until final event',async()=>fixture(async root=>{
 const first=await captureUiStep(page,opts(1),root);const latest=await loadDemo(root);assert.equal(latest.demo.status,'RUNNING');assert.match(demoSummary(latest.demo),/Bước ghi nhận/);
 await captureUiStep(page,{...opts(2),status:'FAILED',result:'Real assertion failed'},root);
 const state={},sent=[],snapshots=[];const persist=async()=>snapshots.push(structuredClone(state));
 await drainDemoStream(root,state,persist,async file=>{assert.equal(Object.values(snapshots.at(-1).demoStream).at(-1),'pending');sent.push((await loadDemo(root,file)).demo.id);return 'sent';});
 await drainDemoStream(root,state,persist,async()=>{throw Error('must not resend');});assert.deepEqual(sent,[first.id,'actual-run-step-00002']);assert.equal((await loadDemo(root)).demo.status,'FAILED');
}));
test('privacy/headless/inactive task denied before screenshot and duplicate event never overwrites',async()=>fixture(async root=>{
 let shots=0;const guarded={...page,screenshot:async o=>{shots++;return page.screenshot(o);}};
 await assert.rejects(captureUiStep(guarded,{...opts(1),privacySafe:false},root),/privacy/);
 await assert.rejects(captureUiStep(guarded,{...opts(1),headed:false},root),/Headed/);assert.equal(shots,0);
 await captureUiStep(guarded,opts(1),root);await assert.rejects(captureUiStep(guarded,opts(1),root),/EEXIST/);
 await writeFile(path.join(root,'quality/tasks.json'),JSON.stringify({tasks:[{id:'TEST',status:'PASS'}]}));await assert.rejects(captureUiStep(guarded,opts(2),root),/not active/);
}));
test('uncertain send and persisted pending never replay; corrupt screenshot blocked',async()=>fixture(async root=>{
 const event=await captureUiStep(page,opts(1),root);const state={};let calls=0;
 await drainDemoStream(root,state,async()=>{},async()=>{calls++;throw Error('lost receipt');});
 await drainDemoStream(root,state,async()=>{},async()=>{calls++;});assert.equal(calls,1);assert.deepEqual(Object.values(state.demoStream),['uncertain']);
 const state2={demoStream:{[path.basename(event.manifest)]:'pending'}};await drainDemoStream(root,state2,async()=>{},async()=>{calls++;});assert.equal(calls,1);
 const manifest=JSON.parse(await readFile(path.join(root,'quality/evidence',event.manifest),'utf8'));await writeFile(path.join(root,'quality/evidence',manifest.steps[0].screenshot),Buffer.from('corrupt'));
 const state3={};await drainDemoStream(root,state3,async()=>{},async()=>{calls++;});assert.equal(calls,1);assert.deepEqual(Object.values(state3.demoStream),['invalid']);
}));
