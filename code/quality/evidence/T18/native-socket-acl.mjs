import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SocketEventNames,SocketConversationAckSchema} from '@fg/contracts';
import {createRoomsHarness} from './native-harness.mjs';
const h=await createRoomsHarness();
const ack=async(s,conversationId)=>SocketConversationAckSchema.parse(await s.timeout(5000).emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE,{conversationId}));
try{
 const r=await h.call('POST','/rooms','review-a',{name:'Private socket ACL',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PUBLIC'});assert.equal(r.status,200,JSON.stringify(r));const roomId=r.body.id;
 const conv=(await h.pool.query('SELECT conversation_id FROM rooms WHERE id=$1',[roomId])).rows[0].conversation_id;
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'review-b','MEMBER')",[randomUUID(),roomId]);
 const guest=await h.socket(),outsider=await h.socket('review-d'),member=await h.socket('review-b'),owner=await h.socket('review-a');
 for(const s of [guest,outsider]){const denied=await ack(s,conv);assert.equal(denied.ok,false);assert.equal(denied.error.code,'FORBIDDEN');}
 assert.equal((await ack(member,conv)).ok,true);assert.equal((await ack(owner,conv)).ok,true);
 const received=[];member.on(SocketEventNames.MESSAGE_CREATED,m=>received.push(m));
 assert.equal((await h.call('DELETE',`/rooms/${roomId}/members/review-b`,'review-a')).status,200);
 const revoked=await ack(member,conv);assert.equal(revoked.ok,false);assert.equal(revoked.error.code,'FORBIDDEN');
 const content=`Owner after revoke ${randomUUID()}`;
 const delivered=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Actual owner event was not delivered')),5000);owner.on(SocketEventNames.MESSAGE_CREATED,m=>{if(m.content===content){clearTimeout(timer);resolve(m);}});});
 const sent=await h.call('POST',`/conversations/${conv}/messages`,'review-a',{content,clientMessageId:randomUUID()});assert.equal(sent.status,201,JSON.stringify(sent));const event=await delivered;assert.equal(event.id,sent.body.id);
 await new Promise(resolve=>setTimeout(resolve,250));assert.equal(received.filter(m=>m.content===content).length,0);
 assert.equal((await h.call('GET',`/conversations/${conv}/messages`,'review-b')).status,403);
 console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,realRedisSocket:true,checks:['PUBLIC room still denies guest/outsider private WS subscription','Current room members subscribe successfully','Kick revokes REST/subscription and stale socket receives zero private message while authorized owner receives actual persisted message']}));
}finally{await h.cleanup();console.log('Owned socket ACL fixture cleaned.');}
