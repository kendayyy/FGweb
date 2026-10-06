import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRoomsHarness} from './native-harness.mjs';
const h=await createRoomsHarness();let barrier,listPromise,kickPromise;
try{
 const room=await h.call('POST','/rooms','review-a',{name:'Private metadata must revoke',gameId:h.games[0].id,gameTitle:h.games[0].title,visibility:'PRIVATE'});assert.equal(room.status,200);
 await h.pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'review-b','MEMBER')",[randomUUID(),room.body.id]);
 barrier=await h.pool.connect();await barrier.query('BEGIN');await barrier.query('LOCK TABLE game_profiles IN ACCESS EXCLUSIVE MODE');
 let listComplete=false,kickComplete=false;
 listPromise=h.call('GET','/rooms/own','review-b').then(r=>{listComplete=true;return r;});
 let blocked=false;
 for(let i=0;i<25&&!listComplete;i++){
  const r=await h.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query ILIKE '%game_profiles%' AND pid<>pg_backend_pid()");
  if(r.rows[0].n>0){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(blocked||listComplete,'Neither a real hydration wait nor a completed atomic response was observed');
 const beforeKick=listComplete;
 kickPromise=h.call('DELETE',`/rooms/${room.body.id}/members/review-b`,'review-a').then(r=>{kickComplete=true;return r;});
 await new Promise(resolve=>setTimeout(resolve,350));
 const revokedBeforeHydration=kickComplete&&!beforeKick;
 await barrier.query('COMMIT');barrier.release();barrier=undefined;
 const [list,kick]=await Promise.all([listPromise,kickPromise]);assert.equal(kick.status,200,JSON.stringify(kick));
 if(revokedBeforeHydration){assert([200,403].includes(list.status));if(list.status===200)assert(!list.body.items.some(x=>x.id===room.body.id),'Private room metadata returned after membership revocation committed during DTO hydration');}
 else assert.equal(list.status,200,JSON.stringify(list));
 const after=await h.call('GET','/rooms/own','review-b');assert.equal(after.status,200);assert(!after.body.items.some(x=>x.id===room.body.id));
 console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,blockedHydration:blocked,readCompletedBeforeKick:beforeKick,revokedBeforeHydration,checks:['List response respects completed membership revocation or serializes its authorized read before the kick; subsequent list excludes revoked private room']}));
}finally{
 if(barrier){await barrier.query('ROLLBACK');barrier.release();}
 await Promise.allSettled([listPromise,kickPromise].filter(Boolean));await h.cleanup();console.log('Owned list-revocation fixture cleaned.');
}
