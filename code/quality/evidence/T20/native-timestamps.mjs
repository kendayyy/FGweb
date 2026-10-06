import assert from 'node:assert/strict';
import {createRecruitmentsHarness} from './native-harness.mjs';
const h=await createRecruitmentsHarness();
try {
 const g=h.games[0];const r=await h.call('POST','/recruitments','review-a',{gameId:g.id,gameTitle:g.title,title:'UTC timestamps',mode:'flex',playerCapacity:5,timingType:'now'});assert.equal(r.status,201);
 const row=(await h.pool.query("SELECT extract(epoch FROM created_at AT TIME ZONE 'UTC')*1000 AS epoch_ms FROM recruitments WHERE id=$1",[r.body.id])).rows[0];
 assert(Math.abs(Date.parse(r.body.createdAt)-Number(row.epoch_ms))<1,'Created timestamp must preserve stored UTC instant independent of host timezone');
 console.log(JSON.stringify({realCompiledApp:true,utcCreatedAt:true}));
}finally{await h.cleanup();console.log('Owned timestamp fixture cleaned.');}
