import assert from 'node:assert/strict';
import {JoinRequestSchema,TeamSnapshotSchema} from '@fg/contracts';
import {createRecruitmentsHarness} from './native-harness.mjs';
const h=await createRecruitmentsHarness(),checks=[];
try{
 const game=h.games.find(g=>g.title==='Valorant');assert(game);
 const payload={gameId:game.id,gameTitle:game.title,title:'FG real team',mode:'Ranked',playerCapacity:2,timingType:'now'};
 const first=await h.call('POST','/recruitments','review-a',payload),second=await h.call('POST','/recruitments','review-b',payload);assert.equal(first.status,201);assert.equal(second.status,201);
 const apply=await h.call('POST',`/recruitments/${first.body.id}/requests`,'review-c',{}),other=await h.call('POST',`/recruitments/${second.body.id}/join-requests`,'review-c',{});assert.equal(apply.status,201);assert.equal(other.status,201);JoinRequestSchema.parse(apply.body);
 const result=await Promise.all([h.call('POST',`/join-requests/${apply.body.id}/approve`,'review-a',{}),h.call('PATCH',`/join-requests/${other.body.id}/respond`,'review-b',{action:'ACCEPT'})]);
 assert(result[0].status===201&&result[1].status===409||result[0].status===409&&result[1].status===200,'Exactly one successful approval; alias201 or legacy200; loser409');
 const winning=result[0].status===201?first:second,request=result[0].status===201?apply:other,owner=result[0].status===201?'review-a':'review-b';
 assert(result.some(r=>[200,201].includes(r.status))&&result.some(r=>r.status===409));
 const playId=(await h.pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[winning.body.id])).rows[0].play_session_id;
 const snapshot=await h.call('GET',`/play-sessions/${playId}`,'review-c');assert.equal(snapshot.status,200);assert.equal(TeamSnapshotSchema.parse(snapshot.body).roster.length,2);
 assert.equal((await h.call('GET',`/play-sessions/${playId}`)).status,401);assert.equal((await h.call('GET',`/play-sessions/${playId}`,'review-d')).status,403);
 const again=await h.call('POST',`/join-requests/${request.body.id}/approve`,owner,{});assert.equal(again.status,201);assert.equal(again.body.status,'ACCEPTED');
 assert.equal((await h.pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['review-c'])).rowCount,1);
 assert.equal((await h.pool.query("SELECT * FROM notifications WHERE type='JOIN_REQUEST_RESULT'")).rowCount,1);
 checks.push('actual compiled AppModule alias/legacy apply and concurrent approval','one active slot; repeated approval/outbox dedup','shared member-only REST snapshot guest401/nonmember403');
 const scheduled=await h.call('POST','/recruitments','review-a',{...payload,timingType:'scheduledAt',scheduledAt:'2099-10-07T13:30:00Z'});assert.equal(scheduled.status,201);
 const reserve=await h.call('POST',`/recruitments/${scheduled.body.id}/requests`,'review-c',{});assert.equal(reserve.status,201);assert.equal((await h.call('POST',`/join-requests/${reserve.body.id}/approve`,'review-a',{})).status,201);
 assert.equal((await h.pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['review-c'])).rowCount,1);checks.push('scheduled roster reservation while already active does not allocate another slot');
 console.log(JSON.stringify({realCompiledApp:true,realPostgres:true,checks,mediaLoadVerified:false}));
}finally{await h.cleanup();console.log('Owned T22 native schema and services cleaned.');}
