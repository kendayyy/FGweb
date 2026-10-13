import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),h=s=>createHash('sha256').update(s).digest('hex'),files=[];
function transform(old,next,edits){const before=read(old);let after=before;for(const[a,b]of edits){assert.equal(after.split(a).length,2,'unique anchor '+old+': '+a);after=after.replace(a,b);}let reversed=after;for(const[a,b]of [...edits].reverse())reversed=reversed.replace(b,a);assert.equal(reversed,before);files.push({old,next,beforeSha256:h(before),afterSha256:h(after),reverseByteExact:true,edits});return after;}
const outputs=[];
outputs.push(['lifecycle-red-probe-support-reviewed5.mjs',transform('lifecycle-red-probe-support-reviewed4.mjs','lifecycle-red-probe-support-reviewed5.mjs',[
 ['reads++;if(reads===1){enteredFirst();await gate;}','reads++;'],
 ['participants++;await new Promise(resolve=>setTimeout(resolve,40));','participants++;if(participants===1){enteredFirst();await gate;}await new Promise(resolve=>setTimeout(resolve,40));']
])]);
const old=read('lifecycle-coalescing-controls-reviewed5.mjs'),start=old.indexOf('  client.listRooms=async function'),end=old.indexOf('return client;',start);assert(start>0&&end>start);
const block=old.slice(start,end),replacement=`  client.listRooms=async function(...callArgs){return Reflect.apply(rooms,this,callArgs);};
  client.listParticipants=async function(...callArgs){
   const c=current;if(!c||![\`fg-call_\${group1}\`,\`fg-call_\${group2}\`].includes(callArgs[0]))return Reflect.apply(people,this,callArgs);
   const ordinal=++c.attempts;if(c.fault)throw c.fault;
   const value=await Reflect.apply(people,this,callArgs);sdkReads++;c.reads++;c.groups.add(callArgs[0]===\`fg-call_\${group1}\`?'group1':'group2');
   c.participantSnapshots.push(value.find(peer=>peer.identity===slot.identity)?.metadata??null);
   if(c.participantGate&&c.participantSnapshots.length===1){c.participantGate.enter();await c.participantGate.wait;}
   const gate=c.hooks.get(ordinal);if(gate){gate.enter();await gate.wait;}return value;
  };`;
outputs.push(['lifecycle-coalescing-controls-reviewed6.mjs',transform('lifecycle-coalescing-controls-reviewed5.mjs','lifecycle-coalescing-controls-reviewed6.mjs',[[block,replacement]])]);
outputs.push(['fixture-server-coalescing-green-reviewed12.mjs',transform('fixture-server-coalescing-green-reviewed11.mjs','fixture-server-coalescing-green-reviewed12.mjs',[
 ['lifecycle-red-probe-support-reviewed4.mjs','lifecycle-red-probe-support-reviewed5.mjs'],['lifecycle-coalescing-controls-reviewed5.mjs','lifecycle-coalescing-controls-reviewed6.mjs']
])]);
outputs.push(['probe-coalescing-build26-web3-reviewed2.mjs',transform('probe-coalescing-build26-web3-reviewed1.mjs','probe-coalescing-build26-web3-reviewed2.mjs',[
 ['fixture-server-coalescing-green-reviewed11.mjs','fixture-server-coalescing-green-reviewed12.mjs'],["folder=d+'/coalescing-build26-web3'","folder=d+'/coalescing-build26-web3-2'"],
 ['assert.equal(burst.actualListParticipantsCalls,burst.actualListRoomsCalls);assert(burst.actualListRoomsCalls<=2,\'INTENDED_RED_BOUNDED_NATIVE_READS\');',"assert.equal(burst.actualListParticipantsCalls,2,'Exactly one initial and one fresh trailing snapshot for four callers');assert.equal(burst.actualListRoomsCalls,0,'Actual joined participant proves presence without redundant room RPC');"],
 ['coalescing-build26-web3-review1.json','coalescing-build26-web3-review2.json']
])]);
outputs.push(['supabase-test-resource139.mjs',read('supabase-test-resource137.mjs').replaceAll('resource137','resource139')]);
const runSource=read('run-build26-guards-resource137.mjs'),runStart=runSource.indexOf('runs='),runEnd=runSource.indexOf(';const run=',runStart);assert(runEnd>runStart);
const runs=[['t30-supabase-temporary-stop-139',['node',d+'/supabase-test-resource139.mjs','stop']],['t30-coalescing-build26-green-2',['node',d+'/probe-coalescing-build26-web3-reviewed2.mjs','canonical']],...['normal','media-io'].map(mode=>['t30-codex-gateway-linux-'+mode+'-7',['node',d+'/probe-codex-gateway-linux7-'+mode+'.mjs','canonical']])];
outputs.push(['run-build26-remaining-resource139.mjs',(runSource.slice(0,runStart)+'runs='+JSON.stringify(runs)+runSource.slice(runEnd)).replaceAll('resource137','resource139').replaceAll('restore-137','restore-139')]);
for(const[n]of outputs)assert(!fs.existsSync(d+'/'+n));for(const[n,s]of outputs)fs.writeFileSync(d+'/'+n,s,{flag:'wx'});
fs.writeFileSync(d+'/coalescing-native-read-observer-review1.json',JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',files,reason:'Build26 nonempty native snapshot correctly omits listRooms. Observe/gate/inject errors on mandatory listParticipants instead. All seven coalescing control bodies and deadlines byte exact; burst strengthens exact two snapshots and zero redundant rooms on actual joined peer. No application or frozen E2E changes.',nativeAcceptance:false},null,2)+'\n',{flag:'wx'});
console.log('Fresh native-read observers prepared with reversible exact edits; seven control bodies/deadlines retained.');
