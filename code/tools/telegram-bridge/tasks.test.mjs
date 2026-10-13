import test from 'node:test';
import assert from 'node:assert/strict';
import {taskReport} from './tasks.mjs';
import {Controller} from './core.mjs';
test('ledger order includes blocked and failed tasks, dependencies and only matching evidence',()=>{
 const ledger={tasks:[{id:'OLD',status:'PASS'},{id:'CURRENT',status:'IN_PROGRESS',startedAt:'2026-10-10T00:00:00Z'},{id:'FIX',status:'FAILED',dependencies:['CURRENT']},{id:'NEXT',status:'BLOCKED',dependencies:['FIX']},{id:'QA',status:'NOT_STARTED',dependencies:['NEXT']}]};
 const text=taskReport(ledger,{task:'CURRENT',recordedAt:'now',remaining:['review code']});
 assert.match(text,/Task hiện tại.*CURRENT/);assert.match(text,/review code/);assert.match(text,/1\. FIX/);assert.match(text,/2\. NEXT/);assert.match(text,/3\. QA/);assert.match(text,/CURRENT \(IN_PROGRESS\)/);assert.doesNotMatch(text,/OLD/);
 assert.doesNotMatch(taskReport(ledger,{task:'OLD',remaining:['stale detail']}),/stale detail/);
});
test('passed-only and missing ledger are truthful',()=>{
 assert.match(taskReport({tasks:[{id:'DONE',status:'PASS'}]}),/không có task chưa PASS/);
 assert.throws(()=>taskReport({}),/unavailable/);
});
test('/task requires numeric authorization, replies to requester and does not dispatch',async()=>{
 const sent=[];let reads=0;
 const state={offset:0,ownerId:1,chatId:1,invitedUsers:[{username:'guest',userId:2}]};
 const bot=new Controller({state,clock:()=>1000000,persist:async()=>{},send:async(id,text)=>sent.push({id,text}),tasks:async()=>{reads++;return 'task CURRENT';},dispatch:async()=>{throw Error('must not dispatch');}});
 const update=(id,user)=>({update_id:id,message:{date:1000,text:'/task',chat:{id:user,type:'private'},from:{id:user}}});
 await bot.handle(update(1,3));await bot.handle(update(2,2));assert.equal(reads,1);assert.equal(sent[0].id,2);assert.match(sent[0].text,/CURRENT/);
});

test('task names come from approved table, headings and supplement without changing ledger order',async()=>{
 const {taskNames}=await import('./tasks.mjs');
 const markdown='| T29 | BACKEND | Cấp quyền phát màn hình | T28 |\n### T30 — Live màn hình\n| CHATCRYPTO-FE | Client mã hóa/giải mã | Headed E2E |\n**T36-SUPPORT-DATA (bổ sung trước T37):** contracts/schema hỗ trợ; các files';
 const names=taskNames(markdown);const ledger={tasks:[{id:'T29',status:'IN_PROGRESS'},{id:'T30',status:'NOT_STARTED'},{id:'T36-SUPPORT-DATA',status:'NOT_STARTED'}]};
 const original=structuredClone(ledger);const text=taskReport(ledger,undefined,Date.now(),names);
 assert.match(text,/T29: Cấp quyền phát màn hình/);assert.match(text,/1\. T30: Live màn hình/);assert.match(text,/2\. T36-SUPPORT-DATA: contracts\/schema hỗ trợ/);assert.deepEqual(ledger,original);
 assert.equal(names.get('CHATCRYPTO-FE'),'Client mã hóa/giải mã');
});
