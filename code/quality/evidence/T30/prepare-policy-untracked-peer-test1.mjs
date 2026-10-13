import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),put=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'}),old=read('lifecycle-policy-reuse-tests3/t30-lifecycle-policy-reuse.integration.spec.ts');
const added=`
  it('untracked native identity retains the original fresh policy evaluation path',async()=>{
    const f=await seedControlledCall();await pool.query('UPDATE call_admissions SET connected_at=clock_timestamp(),disconnected_at=NULL WHERE id=$1',[f.admissionId]);
    activeParticipants=[{identity:f.admissionId,state:ParticipantInfo_State.ACTIVE,tracks:[],permission},{identity:'untracked-native-identity',state:ParticipantInfo_State.ACTIVE,tracks:[],permission}] as unknown as ParticipantInfo[];
    const ownPool=(lifecycleService as any).pool,connect=ownPool.connect,restoreClients:Array<()=>void>=[],reads:Array<{name:string;ids:string[]}>=[];
    ownPool.connect=function(...args:any[]){return Reflect.apply(connect,this,args).then((client:pg.PoolClient)=>{const query=client.query;client.query=function(...queryArgs:any[]){if(queryArgs[0]?.name?.startsWith('fg_live_call_admission'))reads.push({name:queryArgs[0].name,ids:[...queryArgs[0].values[0]]});return Reflect.apply(query,this,queryArgs);} as typeof client.query;restoreClients.push(()=>{client.query=query;});return client;});};
    try{await reconcile(f.callId);expect(reads).toHaveLength(2);expect(reads[0].ids).toEqual([f.admissionId]);expect(reads[1].ids).toEqual([f.admissionId,'untracked-native-identity']);expect((await row(f.admissionId)).revoked_at).toBeNull();observations.push({kind:'untrackedNativeFreshPolicyFallback',eligibilityUsesMembersOnly:true,freshNativePolicyFallback:true});}
    finally{ownPool.connect=connect;for(const restore of restoreClients)restore();}
  });
`;
const end=old.lastIndexOf('});');assert(end>0);const next=old.slice(0,end)+added+old.slice(end);assert.equal(next.replace(added,''),old);fs.mkdirSync(d+'/lifecycle-policy-reuse-tests4');put('lifecycle-policy-reuse-tests4/t30-lifecycle-policy-reuse.integration.spec.ts',next);
put('lifecycle-policy-reuse-jest4.config.cjs',read('lifecycle-policy-reuse-jest3.config.cjs').replaceAll('lifecycle-policy-reuse-tests3','lifecycle-policy-reuse-tests4').replaceAll('jest-lifecycle-policy-reuse3','jest-lifecycle-policy-reuse4'));
put('run-lifecycle-policy-reuse4.mjs',read('run-lifecycle-policy-reuse3.mjs').replaceAll('lifecycle-policy-reuse-jest3','lifecycle-policy-reuse-jest4').replaceAll('lifecycle-policy-reuse-tests3','lifecycle-policy-reuse-tests4'));
put('supabase-test-resource182.mjs',read('supabase-test-resource181.mjs').replaceAll('resource181','resource182'));
put('run-policy-untracked-red-resource182.mjs',read('run-lifecycle-policy-reuse-green-resource181.mjs').replaceAll('resource181','resource182').replaceAll('stop-181','stop-182').replaceAll('restore-181','restore-182').replaceAll('lifecycle-policy-reuse-green-1','policy-untracked-peer-red-1').replaceAll('run-lifecycle-policy-reuse3.mjs','run-lifecycle-policy-reuse4.mjs'));
console.log('Added actual PostgreSQL untracked-native fallback control; prior13 cases byte unchanged.');
