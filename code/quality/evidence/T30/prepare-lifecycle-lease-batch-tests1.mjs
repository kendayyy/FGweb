import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',dir=d+'/lifecycle-lease-batch-tests1';assert(!fs.existsSync(dir));fs.mkdirSync(dir);
let s=fs.readFileSync(d+'/noop-write-tests3/t30-lifecycle-noop-write.integration.spec.ts','utf8');
s=s.replaceAll('t30_noop_corr_','t30_lifecycle_batch_').replaceAll('noop-write-cleanup-','lifecycle-lease-batch-cleanup-');
s=s.replace('const reconcile=(id:string)',`async function captureLeaseReads(fn:()=>Promise<void>){
    const lp=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();const reads:{name:string;durationMs:number}[]=[];
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);
      client.query=function(...args:any[]){const started=performance.now(),result=Reflect.apply(original,this,args),name=args[0]?.name;
        if(name==='fg_live_call_admission_v1'||name==='fg_live_call_admissions_v1')result.then(()=>reads.push({name,durationMs:performance.now()-started}),()=>{});
        return result;
      } as typeof client.query;
    };lp.on('acquire',acquire);
    try{await fn();}finally{lp.removeListener('acquire',acquire);for(const[client,original]of originals)client.query=original;}
    return reads;
  }
  async function seedTen(){const f=await seedControlledCall();const people=[f];
    for(let seat=2;seat<=10;seat++){const user=randomUUID(),session=randomUUID(),cmId=randomUUID(),admissionId=randomUUID();
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[user,user+'@fixture.invalid']);
      await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[user]);
      await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),user,valorantGame.id]);
      await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[session,user,'tok-'+session]);
      await pool.query("INSERT INTO room_members(id,room_id,user_id,role,joined_at) VALUES($1,$2,$3,'MEMBER',now())",[randomUUID(),f.roomId,user]);
      await pool.query('INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index,is_muted,joined_at) VALUES($1,$2,$3,$4,$5,false,now())',[cmId,f.callId,f.roomId,user,seat]);
      await pool.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at,created_at) VALUES($1,$2,$3,now()+interval '1 day',now())",[admissionId,cmId,session]);
      people.push({...f,cmId,admissionId});
    }
    activeParticipants=people.map(p=>({identity:p.admissionId,state:ParticipantInfo_State.ACTIVE,tracks:[]} as unknown as ParticipantInfo));return people;
  }
  it('ten live native identities retain all seats with one canonical eligibility query',async()=>{
    const people=await seedTen(),reads=await captureLeaseReads(()=>reconcile(people[0].callId));
    const live=(await pool.query('SELECT count(*)::int AS n FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[people[0].callId])).rows[0].n;
    observations.push({kind:'ten-live',live,reads});expect(live).toBe(10);expect(reads.length).toBeLessThanOrEqual(1);
  });
  it('mixed ten-member batch removes revoked, expired, logged-out and incomplete profiles despite native presence',async()=>{
    const people=await seedTen();
    await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[people[1].admissionId]);
    await pool.query("UPDATE call_admissions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[people[2].admissionId]);
    await pool.query('DELETE FROM session WHERE id=(SELECT session_id FROM call_admissions WHERE id=$1)',[people[3].admissionId]);
    await pool.query('DELETE FROM game_interests WHERE user_id=(SELECT user_id FROM call_members WHERE id=$1)',[people[4].cmId]);
    const reads=await captureLeaseReads(()=>reconcile(people[0].callId));
    const left=await Promise.all(people.map(async p=>(await member(p.cmId)).left_at!==null));
    observations.push({kind:'mixed-guards',left,reads});expect(left).toEqual([false,true,true,true,true,false,false,false,false,false]);
    expect(reads.length).toBeLessThanOrEqual(1);
  });
  it('canonical wait reads expiry and revocation committed before acquiring the room lock',async()=>{
    const people=await seedTen(),held=await pool.connect();const lp=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();let observedResolve!:()=>void;
    const observed=new Promise<void>(resolve=>{observedResolve=resolve;});
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const original=client.query;originals.set(client,original);client.query=function(...args:any[]){const result=Reflect.apply(original,this,args);if(typeof args[0]==='string'&&/^SELECT id FROM rooms.*FOR UPDATE/.test(args[0]))observedResolve();return result;} as typeof client.query;};
    let pending:Promise<void>|undefined;
    try{await held.query('BEGIN');await held.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[people[0].roomId]);lp.on('acquire',acquire);pending=reconcile(people[0].callId);await observed;
      await held.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[people[1].admissionId]);
      await held.query("UPDATE call_admissions SET created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[people[2].admissionId]);await held.query('COMMIT');await pending;
      expect((await member(people[1].cmId)).left_at!==null).toBe(true);expect((await member(people[2].cmId)).left_at!==null).toBe(true);expect((await member(people[0].cmId)).left_at===null).toBe(true);
      observations.push({kind:'fresh-after-lock',revokedReleased:true,expiredReleased:true,validRetained:true});
    }finally{await held.query('ROLLBACK');held.release();if(pending)await pending;lp.removeListener('acquire',acquire);for(const[client,original]of originals)client.query=original;}
  });
  const reconcile=(id:string)`);
fs.writeFileSync(dir+'/t30-lifecycle-lease-batch.integration.spec.ts',s,{flag:'wx'});
let config=fs.readFileSync(d+'/noop-write-jest3.config.cjs','utf8').replaceAll('noop-write-tests3','lifecycle-lease-batch-tests1').replaceAll('jest-noop-write3','jest-lifecycle-lease-batch1');fs.writeFileSync(d+'/lifecycle-lease-batch-jest1.config.cjs',config,{flag:'wx'});
let runner=fs.readFileSync(d+'/run-noop-write3.mjs','utf8').replaceAll("['noop-write']","['lifecycle-lease-batch']").replaceAll('noop-write-jest3.config.cjs','lifecycle-lease-batch-jest1.config.cjs').replaceAll('noop-write-tests3/t30-lifecycle-noop-write.integration.spec.ts','lifecycle-lease-batch-tests1/t30-lifecycle-lease-batch.integration.spec.ts');
fs.writeFileSync(d+'/run-lifecycle-lease-batch1.mjs',runner,{flag:'wx'});
const h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(d+'/lifecycle-lease-batch-test-review1.json',JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',nativeAcceptance:false,scope:'Controlled SDK presence plus actual owned PostgreSQL; no native latency or unique native71 root-cause claim',hypothesis:'Serial canonical eligibility queries lengthen exclusive lock duration proportionally to member count; one fresh query after canonical and member locks preserves predicates, subsequent native permissions remain freshly checked per peer.',tests:10,sourceBefore:h('apps/api/src/modules/calls/call-lifecycle.service.ts'),testSha256:h(dir+'/t30-lifecycle-lease-batch.integration.spec.ts'),originalNoopTestsUnchanged:true},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+new Date().toISOString()+': Codex test-only controlled eligibility-batching hypothesis: serial member eligibility SQL under canonical exclusive lock. ActualPG ten-live/mixed revoked-expired-logout-onboarding and fresh revocation/expiry after room-lock wait plus original7noop tests copied unchanged. SDK deterministic presence only, no native SFU latency claim; no app mutation yet. Evidence code/quality/evidence/T30/lifecycle-lease-batch-test-review1.json; IN_PROGRESS/no cockpit startup/noT31.\n');
