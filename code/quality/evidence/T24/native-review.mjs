import assert from 'node:assert/strict';
import {RecruitmentSchema,PlaySessionSchema,JoinRequestSchema} from '@fg/contracts';
import {createPlaySessionsHarness} from './native-harness.mjs';
const h=await createPlaySessionsHarness();
try{
 const game=h.games.find(g=>g.title==='Valorant');assert(game);
 const created=await h.call('POST','/recruitments','review-a',{gameId:game.id,gameTitle:game.title,title:'Native lifecycle',mode:'ranked',playerCapacity:2,timingType:'scheduledAt',scheduledAt:'2099-10-07T13:00:00Z'});assert.equal(created.status,201);const card=RecruitmentSchema.parse(created.body);
 const id=(await h.pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[card.id])).rows[0].play_session_id;
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES('native-member',$1,'review-b','MEMBER')",[card.roomId]);
 await h.pool.query("INSERT INTO conversation_members(id,conversation_id,user_id) SELECT 'native-chat-member',conversation_id,'review-b' FROM rooms WHERE id=$1",[card.roomId]);
 assert.equal((await h.call('PATCH',`/rooms/${card.roomId}/settings`,'review-a',{visibility:'PRIVATE'})).status,200);
 const join=await h.call('POST',`/play-sessions/${id}/join`,'review-b',{});assert.equal(join.status,201);JoinRequestSchema.parse(join.body);assert.equal(join.body.status,'PENDING');
 assert.equal((await h.call('GET',`/play-sessions/${id}/requests`,'review-b')).status,403);
 assert.equal((await h.call('POST',`/play-sessions/${id}/requests/${join.body.id}/respond`,'review-a',{action:'ACCEPT'})).status,201);
 assert.equal((await h.pool.query('SELECT user_id FROM active_play_slots')).rowCount,0);
 const start=await h.call('POST',`/play-sessions/${id}/start`,'review-a',{});assert.equal(start.status,201);assert.equal(PlaySessionSchema.parse(start.body).state,'ACTIVE');
 assert.equal((await h.pool.query('SELECT user_id FROM active_play_slots WHERE play_session_id=$1',[id])).rowCount,2);
 const leave=await h.call('POST',`/play-sessions/${id}/leave`,'review-b',{});assert.equal(leave.status,201);assert.deepEqual(leave.body,{success:true});
 assert.equal((await h.pool.query("SELECT user_id FROM active_play_slots WHERE user_id='review-b'")).rowCount,0);
 const end=await h.call('POST',`/play-sessions/${id}/end`,'review-a',{});assert.equal(end.status,201);assert.equal(PlaySessionSchema.parse(end.body).state,'ENDED');assert.deepEqual((await h.call('POST',`/play-sessions/${id}/end`,'review-a',{})).body,end.body);
 assert.equal((await h.pool.query('SELECT user_id FROM active_play_slots')).rowCount,0);assert.equal((await h.pool.query('SELECT id FROM rooms WHERE id=$1',[card.roomId])).rowCount,1);
 assert.equal((await h.pool.query("SELECT id FROM room_members WHERE room_id=$1 AND user_id='review-b'",[card.roomId])).rowCount,1);
 assert.equal((await h.call('POST',`/play-sessions/${id}/start`,'review-a',{})).status,409);
 console.log(JSON.stringify({realCompiledApp:true,realPostgres:true,privateMemberApproval:true,scheduledReservationWithoutSlot:true,atomicManualStart:true,leavePreservesRoom:true,idempotentEnd:true,endedNotRestarted:true,mediaLoadVerified:false}));
}finally{await h.cleanup();console.log('Owned native T24 schema and service connections cleaned.');}
