import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',old=fs.readFileSync(d+'/noop-write-tests3/t30-lifecycle-noop-write.integration.spec.ts','utf8');
const added=`
  it('six present members use one heartbeat statement with unchanged repeat tuples',async()=>{
    const f=await seedControlledCall(),ids=[f.admissionId];
    for(let i=2;i<=6;i++){
      const user=randomUUID(),session=randomUUID(),memberId=randomUUID(),admission=randomUUID();
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[user,user+'@fixture.invalid']);
      await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[user]);
      await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),user,valorantGame.id]);
      await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[session,user,'tok-'+session]);
      await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",[randomUUID(),f.roomId,user]);
      await pool.query('INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES($1,$2,$3,$4,$5)',[memberId,f.callId,f.roomId,user,i]);
      await pool.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",[admission,memberId,session]);ids.push(admission);
    }
    activeParticipants=ids.map(identity=>({identity,state:ParticipantInfo_State.ACTIVE,tracks:[]} as unknown as ParticipantInfo));
    const time=Date.now();lifecycleService.setClock(()=>time);
    const first=await captureConnectedAtUpdate(()=>reconcile(f.callId));
    const before=await Promise.all(ids.map(row));
    expect(first).toEqual({count:1,rowCount:6});
    for(const r of before){expect(r.connected_at.getTime()).toBe(time);expect(r.disconnected_at).toBeNull();}
    const repeat=await captureConnectedAtUpdate(()=>reconcile(f.callId)),after=await Promise.all(ids.map(row));
    expect(repeat).toEqual({count:1,rowCount:0});
    for(let i=0;i<ids.length;i++){expect(after[i].ctid).toBe(before[i].ctid);expect(after[i].xmin).toBe(before[i].xmin);expect(after[i].connected_at.getTime()).toBe(time);}
    observations.push({kind:'sixMemberHeartbeatBatch',members:6,first,repeat,firstTimestampExact:true,repeatedTuplesUnchanged:true});
  });
`;
const at=old.lastIndexOf('});');assert(at>0);const next=old.slice(0,at)+added+old.slice(at);assert.equal(next.replace(added,''),old);
fs.mkdirSync(d+'/heartbeat-batch-tests1');fs.writeFileSync(d+'/heartbeat-batch-tests1/t30-lifecycle-heartbeat-batch.integration.spec.ts',next,{flag:'wx'});
const config=fs.readFileSync(d+'/noop-write-jest3.config.cjs','utf8').replaceAll('noop-write-tests3','heartbeat-batch-tests1').replaceAll('jest-noop-write3','jest-heartbeat-batch1');fs.writeFileSync(d+'/heartbeat-batch-jest1.config.cjs',config,{flag:'wx'});
const runner=fs.readFileSync(d+'/run-noop-write3.mjs','utf8').replaceAll('noop-write-jest3','heartbeat-batch-jest1').replaceAll('noop-write-tests3/t30-lifecycle-noop-write','heartbeat-batch-tests1/t30-lifecycle-heartbeat-batch');fs.writeFileSync(d+'/run-heartbeat-batch1.mjs',runner,{flag:'wx'});
fs.writeFileSync(d+'/heartbeat-batch-tests-source-review1.json',JSON.stringify({at:new Date().toISOString(),originalSevenTestsByteUnchanged:true,originalHash:createHash('sha256').update(old).digest('hex'),newMultiMemberRealPgCase:true,controlledSdkNotNativeAcceptance:true,sourceUnchanged:true},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+new Date().toISOString()+': Native79 same Build21 after actualBravezero stillRED fourthquotaalert5s; all results preserved, resource105exact10restore0. Prepare additive realPG sixmember heartbeat batching case; historical7noopcases byteunchanged, same physical tuple/time/disconnect/expiry/revocation checks. Existing present loop emits N same no-op UPDATE roundtrips while canonicalgroup locked; candidate one statement for all freshlyeligible/present identities retains WHERErevoked/changed conditions, original7compatible. No source change before RED. Evidence code/quality/evidence/T30/heartbeat-batch-tests-source-review1.json; noPASS/noT31/noCockpit.\n');
