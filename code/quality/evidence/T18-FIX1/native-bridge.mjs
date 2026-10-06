import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RoomSchema,createPageSchema,SocketEventNames,SocketConversationAckSchema} from '@fg/contracts';
import {createRoomsHarness} from '../T18/native-harness.mjs';
const h=await createRoomsHarness();
const subscribe=async(s,conversationId)=>SocketConversationAckSchema.parse(await s.timeout(5000).emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE,{conversationId}));
try {
 const created=await h.call('POST','/rooms','review-a',{name:'Room to chat identity',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PUBLIC'});
 assert.equal(created.status,200);const room=RoomSchema.parse(created.body),conv=room.conversationId;
 const stored=(await h.pool.query('SELECT conversation_id FROM rooms WHERE id=$1',[room.id])).rows[0].conversation_id;
 assert.equal(conv,stored);assert.notEqual(conv,room.id);
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'review-b','MEMBER')",[randomUUID(),room.id]);
 for(const user of ['review-a','review-b']) {
  const detail=await h.call('GET',`/rooms/${room.id}`,user);assert.equal(detail.status,200);assert.equal(RoomSchema.parse(detail.body).conversationId,conv);
  for(const route of ['/rooms','/rooms/own']) {
   const list=await h.call('GET',route,user);assert.equal(list.status,200);const page=createPageSchema(RoomSchema).parse(list.body);
   assert.equal(page.items.find(r=>r.id===room.id)?.conversationId,conv);
  }
 }
 const settings=await h.call('PATCH',`/rooms/${room.id}/settings`,'review-a',{visibility:'PRIVATE'});
 assert.equal(settings.status,200);assert.equal(RoomSchema.parse(settings.body).conversationId,conv);
 const transferred=await h.call('POST',`/rooms/${room.id}/transfer-owner`,'review-a',{newOwnerId:'review-b'});
 assert.equal(transferred.status,200);assert.equal(RoomSchema.parse(transferred.body).conversationId,conv);
 const owner=await h.socket('review-b'),member=await h.socket('review-a'),outsider=await h.socket('review-d'),guest=await h.socket();
 for(const s of [owner,member]) assert.equal((await subscribe(s,conv)).ok,true);
 for(const s of [outsider,guest]) {const denied=await subscribe(s,conv);assert.equal(denied.ok,false);assert.equal(denied.error.code,'FORBIDDEN');}
 for(const method of ['GET','POST']) {
  const body=method==='POST'?{content:'Denied outsider',clientMessageId:randomUUID()}:undefined;
  assert.equal((await h.call(method,`/conversations/${conv}/messages`,'review-d',body)).status,403);
 }
 const received=[];member.on(SocketEventNames.MESSAGE_CREATED,m=>received.push(m));
 const content=`Verified live room ${randomUUID()}`;
 const delivered=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Actual private room message not delivered')),5000);owner.on(SocketEventNames.MESSAGE_CREATED,m=>{if(m.content===content){clearTimeout(timer);resolve(m);}});});
 const sent=await h.call('POST',`/conversations/${conv}/messages`,'review-b',{content,clientMessageId:randomUUID()});assert.equal(sent.status,201);
 assert.equal((await delivered).id,sent.body.id);
 const history=await h.call('GET',`/conversations/${conv}/messages`,'review-a');assert.equal(history.status,200);assert(history.body.items.some(m=>m.id===sent.body.id));
 assert.equal((await h.call('DELETE',`/rooms/${room.id}/members/review-a`,'review-a')).status,200);
 assert.equal((await subscribe(member,conv)).ok,false);
 for(const method of ['GET','POST']) assert.equal((await h.call(method,`/conversations/${conv}/messages`,'review-a',method==='POST'?{content:'Revoked',clientMessageId:randomUUID()}:undefined)).status,403);
 const deniedList=await h.call('GET','/rooms/own','review-a');assert.equal(deniedList.status,200);assert(!deniedList.body.items.some(r=>r.id===room.id));
 const after=`After revoke ${randomUUID()}`;
 assert.equal((await h.call('POST',`/conversations/${conv}/messages`,'review-b',{content:after,clientMessageId:randomUUID()})).status,201);
 await new Promise(r=>setTimeout(r,300));assert.equal(received.filter(m=>m.content===after).length,0);
 console.log(JSON.stringify({realApi:true,realPostgres:true,realRedisSocket:true,checks:['Create/detail/both list aliases/settings/transfer preserve stored conversation FK distinct from room ID','Authorized room members use returned ID for history/send/live delivery','Guest/outsider cannot subscribe; outsider cannot read/send private chat','Leave revokes returned ID REST/socket and removes room from own list; stale socket sees zero subsequent message']}));
} finally {await h.cleanup();console.log('Owned identity bridge fixture cleaned.');}
