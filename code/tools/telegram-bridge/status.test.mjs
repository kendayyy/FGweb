import test from 'node:test';
import assert from 'node:assert/strict';
import {StatusView} from './status.mjs';
const sessions = [{id:'a',title:'Coding and build 2',cwd:'E:/FGweb',status:'active'}, {id:'b',title:'Idea logo',cwd:'E:/Other',status:{type:'active'}}, {id:'c',title:'Idea notes',status:'idle'}];
function fixture() {
  let inventory=sessions, now=1000000;
  const reads=[];
  const app={targets:async()=>inventory,read:async id=>{reads.push(id);return {thread:{id},turns:[{items:[{type:'agentMessage',id:'m',phase:'commentary',text:`progress ${id}`},{type:'userMessage',text:'private secret'}]}]};}};
  return {view:new StatusView(app,()=>now), reads,remove:()=>{inventory=[];},expire:()=>{now+=300001;},app};
}
test('all active sessions across projects appear with real agent progress',async()=>{
 const f=fixture();const text=await f.view.report();assert.match(text,/Coding and build 2/);assert.match(text,/Idea logo/);assert.match(text,/progress a/);assert.match(text,/progress b/);assert.deepEqual(f.reads,['a','b']);assert.doesNotMatch(text,/private secret/);
});
test('numeric choice stays bound to ID even when inventory reorders and does not change command target',async()=>{
 const f=fixture();await f.view.report();f.app.targets=async()=>sessions.toReversed();const text=await f.view.report('2');assert.match(text,/Idea logo/);assert.doesNotMatch(text,/Coding and build 2/);
});
test('prefix returns all matching chats including idle and supports accent/case',async()=>{
 const f=fixture();const text=await f.view.report('IDEA');assert.match(text,/Idea logo/);assert.match(text,/Idea notes/);assert.deepEqual(f.reads,['b','c']);
});
test('expired and unavailable selections do not read a different chat',async()=>{
 const f=fixture();await f.view.report();f.expire();assert.match(await f.view.report('1'),/hết hạn/);await f.view.report();f.remove();assert.match(await f.view.report('1'),/Không tìm thấy/);
});
test('one failed chat does not hide progress in another active chat',async()=>{
 const f=fixture();const read=f.app.read;f.app.read=async id=>{if(id==='a')throw Error('private detail');return read(id);};const text=await f.view.report();assert.match(text,/Chưa đọc được/);assert.match(text,/progress b/);assert.doesNotMatch(text,/private detail/);
});
