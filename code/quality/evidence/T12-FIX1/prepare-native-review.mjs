import fs from 'node:fs';import assert from 'node:assert/strict';
let text=fs.readFileSync('quality/evidence/T17-BE/blocked-dm-probe.mjs','utf8').replace('t17_probe_','t12_fix1_native_').replace('let app,pool,redis,created=false;','let app,pool,redis,blocker,pending,created=false;');
const marker="Object.assign(process.env,env,";assert(text.includes(marker));
text=text.replace(marker,`await pool.query(\`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('old-message','dm-ab','a','Historical message','old-client'); INSERT INTO pending_image_uploads(id,uploader_id,conversation_id,file_name,file_size,mime_type,expires_at) VALUES('draft-a','a','dm-ab','synthetic.webp',8,'image/webp',now()+interval '1 day'); INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('member-a','dm-ab','a'),('member-b','dm-ab','b'); INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('s-b','b','t12-token-b',now()+interval '1 day',now(),now());\`);
await pool.query(\`INSERT INTO game_interests(id,user_id,game_id) VALUES('i-b','b',$1)\`,[games[0].id]);
${marker}`);
const start=text.indexOf('const response=await fetch('),end=text.indexOf('\n}finally{\nif(app)');assert(start>0&&end>start);
text=text.slice(0,start)+`
const base=await app.getUrl(),cookieB='better-auth.session_token=t12-token-b.'+await makeSignature('t12-token-b',secret);
const send=(auth,id,attachmentIds=[])=>fetch(base+'/api/v1/conversations/dm-ab/messages',{method:'POST',headers:{Origin:origin,Cookie:auth,'Content-Type':'application/json'},body:JSON.stringify({content:'Synthetic review message',clientMessageId:id,attachmentIds}),signal:AbortSignal.timeout(15000)});
const snapshot=async()=>{const result=await pool.query(\`SELECT (SELECT count(*)::int FROM messages) AS messages,(SELECT count(*)::int FROM realtime_outbox) AS outbox,(SELECT count(*)::int FROM pending_image_uploads) AS drafts,(SELECT count(*)::int FROM attachments) AS attachments,(SELECT count(*)::int FROM conversation_members) AS members\`);return result.rows[0];};
const checks=[],before=await snapshot();assert.deepEqual(before,{messages:1,outbox:0,drafts:1,attachments:0,members:2});
for(const auth of [cookie,cookieB]){const response=await send(auth,'blocked-'+checks.length,['draft-a']);assert.equal(response.status,403,'Either block direction must reject before draft/message/outbox effects');assert.deepEqual(await snapshot(),before);checks.push('Blocked write denied before persistence (both actor directions)');}
const history=await fetch(base+'/api/v1/conversations/dm-ab/messages',{headers:{Cookie:cookie}});assert.equal(history.status,200);assert((await history.json()).items.some(item=>item.id==='old-message'));checks.push('Historical participant read and memberships preserved');
await pool.query('DELETE FROM blocks');
const first=await send(cookie,'unblocked-retry');assert.equal(first.status,201);const firstBody=await first.json();const replay=await send(cookie,'unblocked-retry');assert.equal(replay.status,201);assert.equal((await replay.json()).id,firstBody.id);const afterReplay=await snapshot();assert.equal(afterReplay.messages,2);assert.equal(afterReplay.outbox,1);assert.equal(afterReplay.drafts,1);checks.push('Unblocked write and durable idempotent retry');
const {lockSocialPair}=await import('../../../apps/api/dist/modules/chat/chat.service.js');assert.equal(typeof lockSocialPair,'function','Shared transaction helper is required for subsequent social mutations');
blocker=await pool.connect();await blocker.query('BEGIN');await lockSocialPair(blocker,'b','a');await blocker.query(\`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('race-block','b','a')\`);
const held=(await blocker.query(\`SELECT classid::text,objid::text,objsubid FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted\`)).rows;assert.equal(held.length,1);const key=held[0];
pending=send(cookie,'racing-write',['draft-a']);let waiters=0;const deadline=Date.now()+10000;
while(Date.now()<deadline){waiters=(await pool.query(\`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid AND objsubid=$3 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())\`,[key.classid,key.objid,key.objsubid])).rows[0].n;if(waiters>0)break;await new Promise(resolve=>setTimeout(resolve,25));}
assert(waiters>0,'Real DM write must be observed waiting behind the reversed-pair block transaction');assert.deepEqual(await snapshot(),afterReplay);await blocker.query('COMMIT');blocker.release();blocker=null;
const raced=await pending;pending=null;assert.equal(raced.status,403);assert.deepEqual(await snapshot(),afterReplay);checks.push('Real pg_locks barrier: reversed canonical-pair block commit precedes rejected write');
console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,checks,ownedSchema:owned,remainingDrafts:1,preservedMemberRows:2}));
`+text.slice(end);
text=text.replace('\nif(app)await app.close();',"\nif(blocker){await blocker.query('ROLLBACK').catch(()=>{});blocker.release();}if(pending)await pending.catch(()=>{});\nif(app)await app.close();");
fs.writeFileSync('quality/evidence/T12-FIX1/native-independent.mjs',text);
console.log('Independent compiled-API/database probe prepared; run only after implementation build.');
