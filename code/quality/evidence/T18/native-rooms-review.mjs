import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RoomSchema,RoomMemberSchema,createPageSchema} from '@fg/contracts';
import {createRoomsHarness} from './native-harness.mjs';

const h=await createRoomsHarness();const checks=[];
const create=async(name,id='review-a')=>{
 const r=await h.call('POST','/rooms',id,{name,gameId:h.games[0].id,gameTitle:h.games[0].title});
 assert.equal(r.status,200,JSON.stringify(r.body));return RoomSchema.parse(r.body);
};
const member=async(room,id)=>h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",[randomUUID(),room.id,id]);
const validOwner=async(room)=>{
 const r=await h.pool.query("SELECT r.owner_id,count(*) FILTER(WHERE m.role='OWNER')::int AS owners,bool_or(m.user_id=r.owner_id AND m.role='OWNER') AS correct FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.id=$1 GROUP BY r.id",[room.id]);
 assert.equal(r.rowCount,1);assert.equal(r.rows[0].owners,1);assert.equal(r.rows[0].correct,true);return r.rows[0].owner_id;
};
try{
 const first=await create('Phòng thật');
 assert.equal(first.memberCount,1);assert.equal(first.ownerId,'review-a');
 for(const table of ['play_sessions','team_members','active_play_slots','call_groups','call_members'])assert.equal((await h.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
 assert.equal((await h.call('GET',`/rooms/${first.id}`,'review-d')).status,403);
 assert.equal((await h.call('PATCH',`/rooms/${first.id}/settings`,'review-a',{name:'CSRF denied'},'https://outside.example')).status,403);
 assert.equal((await h.pool.query('SELECT name FROM rooms WHERE id=$1',[first.id])).rows[0].name,'Phòng thật');
 checks.push('Real create has owner only, creates no roster/call; outsider403 and wrong-origin403 leave data unchanged');

 const own=[];for(let i=0;i<7;i++)own.push(await create(`Trang ${i}`,'review-b'));
 await h.pool.query("UPDATE rooms SET updated_at='2026-10-06T09:00:00.123456Z',created_at='2026-10-06T09:00:00.123456Z' WHERE owner_id='review-b'");
 let cursor=null;const seen=[];let pages=0;
 do{
  const r=await h.call('GET',`/rooms/own?limit=2${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,'review-b');
  assert.equal(r.status,200,JSON.stringify(r.body));const page=createPageSchema(RoomSchema).parse(r.body);
  assert(page.items.length<=2);assert(page.items.every(x=>x.ownerId==='review-b'));seen.push(...page.items.map(x=>x.id));
  cursor=page.nextCursor;assert.equal(Boolean(cursor),page.hasMore);assert(++pages<=5,'Pagination failed to terminate');
 }while(cursor);
 assert.equal(seen.length,7);assert.equal(new Set(seen).size,7);assert.deepEqual(new Set(seen),new Set(own.map(x=>x.id)));
 checks.push('Seven own rooms share exact microsecond timestamps: cursor pages contain every room once, never outsider rooms');

 const helperRoom=await create('Chuyển người hỗ trợ');await member(helperRoom,'review-b');
 let r=await h.call('PATCH',`/rooms/${helperRoom.id}/helpers/review-b`,'review-a',{permissions:['MANAGE_CALLS','MANAGE_MEMBERS']});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(RoomMemberSchema.parse(r.body).role,'HELPER');
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM permission_grants WHERE room_id=$1',[helperRoom.id])).rows[0].n,2);
 r=await h.call('PATCH',`/rooms/${helperRoom.id}/helpers/review-b`,'review-a',{permissions:['MANAGE_CALLS','MANAGE_MEMBERS','MANAGE_CALLS']});assert.equal(r.status,200,JSON.stringify(r));assert.equal(RoomMemberSchema.parse(r.body).permissions.length,2);
 r=await h.call('POST',`/rooms/${helperRoom.id}/transfer-owner`,'review-a',{newOwnerId:'review-b'});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(RoomSchema.parse(r.body).ownerId,'review-b');assert.equal(await validOwner(helperRoom),'review-b');
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM permission_grants WHERE room_id=$1',[helperRoom.id])).rows[0].n,0);
 assert.equal((await h.call('DELETE',`/rooms/${helperRoom.id}`,'review-a')).status,403);
 checks.push('Owner transfers to an existing helper atomically, removes incompatible helper grants and revokes old-owner destructive permission');

 for(let i=0;i<5;i++){
  const room=await create(`Race ${i}`);await member(room,'review-b');await member(room,'review-c');
  const race=await Promise.all([h.call('POST',`/rooms/${room.id}/transfer-owner`,'review-a',{newOwnerId:'review-b'}),h.call('POST',`/rooms/${room.id}/transfer-owner`,'review-a',{newOwnerId:'review-c'})]);
  assert.equal(race.filter(x=>x.status===200).length,1,JSON.stringify(race));assert.equal(race.filter(x=>x.status===403).length,1,JSON.stringify(race));await validOwner(room);
 }
 checks.push('Five real concurrent double-transfer races: one200/one403 and exactly one matching owner after every commit');

 for(let i=0;i<5;i++){
  const room=await create(`Rời cạnh chuyển ${i}`);await member(room,'review-b');
  const race=await Promise.all([h.call('POST',`/rooms/${room.id}/transfer-owner`,'review-a',{newOwnerId:'review-b'}),h.call('DELETE',`/rooms/${room.id}/members/review-b`,'review-b')]);
  assert(race.every(x=>x.status<500),JSON.stringify(race));const owner=await validOwner(room);assert(['review-a','review-b'].includes(owner));
  assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM room_members WHERE room_id=$1 AND user_id=$2',[room.id,owner])).rows[0].n,1);
 }
 checks.push('Five real leave-versus-transfer races: no500, no ownerless room and final owner remains a member');

 const preserved=await create('Giữ phòng và lịch sử');await member(preserved,'review-b');
 const historyId=(await h.pool.query('SELECT conversation_id FROM rooms WHERE id=$1',[preserved.id])).rows[0].conversation_id;
 const message=await h.call('POST',`/conversations/${historyId}/messages`,'review-a',{content:'Lịch sử phải được giữ',clientMessageId:randomUUID()});assert.equal(message.status,201,JSON.stringify(message));
 const playId=randomUUID(),cardId=randomUUID();
 await h.pool.query("INSERT INTO play_sessions(id,room_id,host_user_id,timing_type,scheduled_at,state) VALUES($1,$2,'review-a','scheduledAt',now()+interval '1 day','SCHEDULED')",[playId,preserved.id]);
 await h.pool.query("INSERT INTO recruitments(id,room_id,game_id,game_title,play_session_id,title,mode,timing_type,scheduled_at) VALUES($1,$2,$3,$4,$5,'Tuyển thật','Flex','scheduledAt',now()+interval '1 day')",[cardId,preserved.id,h.games[0].id,h.games[0].title,playId]);
 const hidden=await h.call('PATCH',`/rooms/${preserved.id}/settings`,'review-a',{visibility:'PRIVATE'});assert.equal(hidden.status,200,JSON.stringify(hidden));
 assert.equal((await h.pool.query('SELECT state FROM recruitments WHERE id=$1',[cardId])).rows[0].state,'CLOSED');
 assert.equal((await h.pool.query("SELECT count(*)::int AS n FROM recruitments c JOIN rooms r ON r.id=c.room_id WHERE c.id=$1 AND c.state='OPEN' AND r.visibility='PUBLIC'",[cardId])).rows[0].n,0);
 // T24 owns the end-session endpoint; simulate its persisted ENDED state without inventing that API.
 await h.pool.query("UPDATE play_sessions SET state='ENDED' WHERE id=$1",[playId]);
 assert.equal((await h.call('GET',`/rooms/${preserved.id}`,'review-b')).status,200);
 const history=await h.call('GET',`/conversations/${historyId}/messages`,'review-b');assert.equal(history.status,200);assert(history.body.items.some(x=>x.content==='Lịch sử phải được giữ'));
 assert.equal((await h.call('GET',`/conversations/${historyId}/messages`,'review-d')).status,403);
 checks.push('PRIVATE atomically closes recruitment and preserves membership/history; persisted ENDED play session preserves real room chat');

 const doomed=await create('Quyền chat sau giải tán');await member(doomed,'review-b');
 const conv=(await h.pool.query('SELECT conversation_id FROM rooms WHERE id=$1',[doomed.id])).rows[0].conversation_id;
 await h.pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',[randomUUID(),conv,'review-b']);
 const callId=randomUUID();await h.pool.query('INSERT INTO call_groups(id,room_id) VALUES($1,$2)',[callId,doomed.id]);
 await h.pool.query("INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES($1,$2,$3,'review-b',1)",[randomUUID(),callId,doomed.id]);
 await h.pool.query("INSERT INTO call_publish_slots(id,call_group_id,user_id,ordinal) VALUES($1,$2,'review-b',1)",[randomUUID(),callId]);
 assert.equal((await h.call('GET',`/conversations/${conv}/messages`,'review-b')).status,200);
 assert.equal((await h.call('DELETE',`/rooms/${doomed.id}`,'review-a')).status,200);
 const denied=await h.call('GET',`/conversations/${conv}/messages`,'review-b');assert([403,404].includes(denied.status),JSON.stringify(denied));
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM room_members WHERE room_id=$1',[doomed.id])).rows[0].n,0);
 assert.equal((await h.pool.query('SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id=$1',[conv])).rows[0].n,0);
 for(const table of ['call_members','call_publish_slots'])assert.equal((await h.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE call_group_id=$1`,[callId])).rows[0].n,0);
 checks.push('Dissolve revokes private chat even when an existing conversation-members fallback row was present; no surviving ACL row');
 console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,realSession:true,checks}));
}finally{await h.cleanup();console.log('Owned T18 reviewer schema/Redis namespace cleaned.');}
