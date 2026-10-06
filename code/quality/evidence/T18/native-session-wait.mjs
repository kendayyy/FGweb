import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRoomsHarness} from './native-harness.mjs';
const h=await createRoomsHarness();let barrier;
try{
 const room=await h.call('POST','/rooms','review-a',{name:'Session expires during lock wait',gameId:h.games[0].id,gameTitle:h.games[0].title});assert.equal(room.status,200,JSON.stringify(room));
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'review-b','MEMBER')",[randomUUID(),room.body.id]);
 barrier=await h.pool.connect();await barrier.query('BEGIN');await barrier.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[room.body.id]);
 const pending=h.call('POST',`/rooms/${room.body.id}/transfer-owner`,'review-a',{newOwnerId:'review-b'});
 let witnessed=false;
 for(let i=0;i<25;i++){
  const waits=await h.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query ILIKE 'SELECT %FROM rooms%FOR UPDATE%'");
  if(waits.rows[0].n>0){witnessed=true;break;}await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(witnessed,'Request did not reach the actual PostgreSQL room lock');
 // Better Auth refreshes a artificially shortened session during HTTP authentication.
 // Expire only after witnessing the request's room lock wait, so authentication has completed.
 await h.pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE id='sess-review-a'");
 assert.equal((await h.pool.query("SELECT expires_at<clock_timestamp() AS expired FROM session WHERE id='sess-review-a'")).rows[0].expired,true);
 await barrier.query('COMMIT');barrier.release();barrier=undefined;
 const denied=await pending;assert.equal(denied.status,401,JSON.stringify(denied));assert.equal(denied.body.code,'LOGIN_REQUIRED');
 assert.equal((await h.pool.query('SELECT owner_id FROM rooms WHERE id=$1',[room.body.id])).rows[0].owner_id,'review-a');
 assert.equal((await h.pool.query("SELECT count(*)::int AS n FROM room_members WHERE room_id=$1 AND role='OWNER' AND user_id='review-a'",[room.body.id])).rows[0].n,1);
 console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,witnessedActualLock:true,checks:['Session expires after HTTP authentication while transfer waits on a real room-row lock; request401 and original ownership unchanged']}));
}finally{
 if(barrier){await barrier.query('ROLLBACK');barrier.release();}
 await h.cleanup();console.log('Owned session-wait fixture cleaned.');
}
