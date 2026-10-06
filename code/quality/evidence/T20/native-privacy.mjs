import assert from 'node:assert/strict';
import {createRecruitmentsHarness} from './native-harness.mjs';
const h=await createRecruitmentsHarness();let barrier;
try {
 const g=h.games[0];const r=await h.call('POST','/recruitments','review-a',{gameId:g.id,gameTitle:g.title,title:'Privacy race',mode:'flex',playerCapacity:5,timingType:'now'});assert.equal(r.status,201);
 barrier=await h.pool.connect();await barrier.query('BEGIN');await barrier.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[r.body.roomId]);
 const pending=h.call('GET',`/recruitments/${r.body.id}`);
 let witnessed=false;
 for(let i=0;i<50;i++){const wait=await h.pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT c.%' AND query LIKE '%FOR SHARE OF c,r,p%'");if(wait.rowCount){witnessed=true;break;}await new Promise(r=>setTimeout(r,50));}
 assert(witnessed,'Actual public read must reach room lock');
 await barrier.query("UPDATE rooms SET visibility='PRIVATE' WHERE id=$1",[r.body.roomId]);await barrier.query('COMMIT');barrier.release();barrier=undefined;
 const denied=await pending;assert.equal(denied.status,404,JSON.stringify(denied));
 assert.equal((await h.call('GET',`/games/${g.id}/recruitments`)).body.items.length,0);
 console.log(JSON.stringify({realCompiledApp:true,actualPrivateRace:true,checks:['Public detail waiting on PostgreSQL room lock rechecks committed PRIVATE and returns404; public list excludes card']}));
}finally{if(barrier){await barrier.query('ROLLBACK');barrier.release();}await h.cleanup();console.log('Owned native privacy fixture cleaned.');}
