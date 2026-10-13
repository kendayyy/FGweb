import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',proposal=d+'/antigravity-lifecycle-noop-write-correction-1',completion=d+'/antigravity-lifecycle-noop-write-correction-completion.json';assert.equal(JSON.parse(fs.readFileSync(completion,'utf8')).exitCode,0);const p=proposal+'/noop-write-tests1/t30-lifecycle-noop-write.integration.spec.ts';let s=fs.readFileSync(p,'utf8');
s=s.slice(0,s.indexOf("  it('Fixture 1"));assert(s.includes('async function captureConnectedAtUpdate'));s=s.replaceAll('../../../../../apps/','../../../../apps/').replaceAll('quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/noop-write-cleanup-','quality/evidence/T30/noop-write-cleanup-');
s=s.replace('  let activeParticipants: ParticipantInfo[] = [];','  let activeParticipants: ParticipantInfo[] = [];\n  const observations:Record<string,unknown>[]=[];\n  afterEach(()=>{lifecycleService?.setClock();activeParticipants=[];});');
s=s.replace('          ...cleanup,','          ...cleanup,\n          observations,');s=s.replace('    if (errors.length) {','    if(!Object.values(cleanup).every(Boolean))errors.push(new Error("Actual cleanup evidence incomplete"));\n    if (errors.length) {');
const a=s.indexOf('  async function captureConnectedAtUpdate(');assert(a>0);s=s.slice(0,a)+`
  async function captureConnectedAtUpdate(fn:()=>Promise<void>){
    let count=0;let rowCount:number|null=null;
    const lifecyclePool=(lifecycleService as unknown as {pool:pg.Pool}).pool;
    const originals=new Map<pg.PoolClient,pg.PoolClient['query']>();
    const acquire=(client:pg.PoolClient)=>{if(originals.has(client))return;const orig=client.query;originals.set(client,orig);
      client.query=function(...args:any[]){const result=Reflect.apply(orig,this,args);const text=typeof args[0]==='string'?args[0]:args[0]?.text??'';
        if(/^UPDATE call_admissions SET connected_at=/.test(text)){count++;if(result&&typeof result.then==='function')result.then((res:any)=>{rowCount=res.rowCount;},()=>{});}
        return result;
      } as typeof client.query;
    };
    lifecyclePool.on('acquire',acquire);
    try{await fn();}finally{lifecyclePool.removeListener('acquire',acquire);for(const [client,orig]of originals)client.query=orig;}
    return {count,rowCount};
  }
  const reconcile=(id:string)=>(lifecycleService as unknown as {reconcileGroup:(id:string)=>Promise<void>}).reconcileGroup(id);
  const present=(id:string)=>{activeParticipants=[{identity:id,state:ParticipantInfo_State.ACTIVE,tracks:[]} as unknown as ParticipantInfo];};
  const row=async(id:string)=>(await pool.query('SELECT ctid::text,xmin::text,connected_at,disconnected_at,revoked_at FROM call_admissions WHERE id=$1',[id])).rows[0];
  const member=async(id:string)=>(await pool.query('SELECT left_at FROM call_members WHERE id=$1',[id])).rows[0];
  it('first presence writes exactly once and sets actual service timestamp',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const time=Date.now();lifecycleService.setClock(()=>time);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const r=await row(f.admissionId);
    observations.push({kind:'first',...capture,timestampExact:r.connected_at?.getTime()===time,disconnectNull:r.disconnected_at===null});
    expect(capture).toEqual({count:1,rowCount:1});expect(r.connected_at?.getTime()===time).toBe(true);expect(r.disconnected_at===null).toBe(true);
  });
  it('already connected actual source must skip physical tuple rewrite',async()=>{
    const f=await seedControlledCall();present(f.admissionId);await reconcile(f.callId);const before=await row(f.admissionId);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const after=await row(f.admissionId);
    observations.push({kind:'repeated',...capture,ctidUnchanged:after.ctid===before.ctid,xminUnchanged:after.xmin===before.xmin,timestampUnchanged:after.connected_at.getTime()===before.connected_at.getTime()});
    expect(capture).toEqual({count:1,rowCount:0});expect(after.ctid===before.ctid).toBe(true);expect(after.xmin===before.xmin).toBe(true);expect(after.connected_at.getTime()===before.connected_at.getTime()).toBe(true);
  });
  it('actual disconnect and reconnect writes once retaining original connected timestamp',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const base=Date.now();lifecycleService.setClock(()=>base);await reconcile(f.callId);const before=await row(f.admissionId);
    activeParticipants=[];lifecycleService.setClock(()=>base+5000);await reconcile(f.callId);const disconnected=await row(f.admissionId);expect(disconnected.disconnected_at?.getTime()===base+5000).toBe(true);
    present(f.admissionId);lifecycleService.setClock(()=>base+10000);const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const after=await row(f.admissionId);
    observations.push({kind:'reconnect',...capture,disconnectCleared:after.disconnected_at===null,firstTimestampRetained:after.connected_at.getTime()===before.connected_at.getTime()});
    expect(capture).toEqual({count:1,rowCount:1});expect(after.disconnected_at===null).toBe(true);expect(after.connected_at.getTime()===before.connected_at.getTime()).toBe(true);
  });
  for(const condition of ['revoked','expired'] as const)it(condition+' admission releases despite native presence',async()=>{
    const f=await seedControlledCall();present(f.admissionId);await reconcile(f.callId);
    if(condition==='revoked')await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[f.admissionId]);
    else await pool.query("UPDATE call_admissions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.admissionId]);
    const capture=await captureConnectedAtUpdate(()=>reconcile(f.callId));const m=await member(f.cmId);const r=await row(f.admissionId);
    observations.push({kind:condition,...capture,released:m.left_at!==null,revoked:r.revoked_at!==null});
    expect(capture.count).toBe(0);expect(m.left_at!==null).toBe(true);expect(r.revoked_at!==null).toBe(true);
  });
  it('absent member retains connection timestamp until exact 30 second grace release',async()=>{
    const f=await seedControlledCall();present(f.admissionId);const base=Date.now();lifecycleService.setClock(()=>base);await reconcile(f.callId);const initial=await row(f.admissionId);
    activeParticipants=[];const disconnect=base+10000;lifecycleService.setClock(()=>disconnect);await reconcile(f.callId);const first=await row(f.admissionId);
    expect(first.disconnected_at?.getTime()===disconnect).toBe(true);expect(first.connected_at.getTime()===initial.connected_at.getTime()).toBe(true);expect((await member(f.cmId)).left_at===null).toBe(true);
    lifecycleService.setClock(()=>disconnect+29999);await reconcile(f.callId);const before=await row(f.admissionId);const retained=(await member(f.cmId)).left_at===null;
    expect(retained).toBe(true);expect(before.disconnected_at.getTime()===disconnect).toBe(true);expect(before.connected_at.getTime()===initial.connected_at.getTime()).toBe(true);
    lifecycleService.setClock(()=>disconnect+30000);await reconcile(f.callId);const released=(await member(f.cmId)).left_at!==null;
    observations.push({kind:'absentGrace',retainedBeforeBoundary:retained,releasedAtBoundary:released});expect(released).toBe(true);
  });
  it('independent unconnected absent admission stays until its expiration boundary',async()=>{
    const f=await seedControlledCall();activeParticipants=[];const expiration=Date.now()+120000;
    await pool.query('UPDATE call_admissions SET expires_at=$2 WHERE id=$1',[f.admissionId,new Date(expiration)]);
    lifecycleService.setClock(()=>expiration-1);await reconcile(f.callId);const retained=(await member(f.cmId)).left_at===null;
    const r=await row(f.admissionId);expect(r.connected_at===null&&r.disconnected_at===null).toBe(true);expect(retained).toBe(true);
    lifecycleService.setClock(()=>expiration);await reconcile(f.callId);const released=(await member(f.cmId)).left_at!==null;
    observations.push({kind:'unconnected',retainedBeforeBoundary:retained,releasedAtBoundary:released});expect(released).toBe(true);
  });
});
`;
fs.mkdirSync(d+'/noop-write-tests1',{recursive:true});fs.writeFileSync(d+'/noop-write-tests1/t30-lifecycle-noop-write.integration.spec.ts',s,{flag:'wx'});
let config=fs.readFileSync(d+'/lock-hold-jest1.config.cjs','utf8').replaceAll('lock-hold-tests1','noop-write-tests1').replaceAll('jest-lock-hold1','jest-noop-write1');fs.writeFileSync(d+'/noop-write-jest1.config.cjs',config,{flag:'wx'});
let runner=fs.readFileSync(d+'/run-lock-hold1.mjs','utf8').replaceAll("['lock-hold']","['noop-write']").replaceAll('lock-hold-jest1','noop-write-jest1').replaceAll('lock-hold-tests1/t30-lock-hold.integration.spec.ts','noop-write-tests1/t30-lifecycle-noop-write.integration.spec.ts');fs.writeFileSync(d+'/run-noop-write1.mjs',runner,{flag:'wx'});
const h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(d+'/noop-write-test-source-review1.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',proposalSha256:h(p),reviewedTestSha256:h(d+'/noop-write-tests1/t30-lifecycle-noop-write.integration.spec.ts'),tests:7,actualSourceService:true,realOwnSchema:true,SDKControlledPresenceOnly:true,scopedLifecyclePoolObserver:true,originalQueryPromisePreserved:true,corrections:['independent expiry and unconnected fixtures','no insert into closed call','exact grace 29999/30000 boundary','safe boolean tuple telemetry','actual cleanup fullflags enforced','existing sanitized runner'],applicationSourceChanged:false,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});console.log('Seven real-source lifecycle controls prepared; no application source mutation.');
