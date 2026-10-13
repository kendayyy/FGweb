import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),put=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'}),old=read('policy-noop-batch-tests1/t30-policy-noop-batch.integration.spec.ts');
const added=`
  it('one locked lifecycle pass evaluates six lease policies once with no native mutations',async()=>{
    const f=await seedPolicyPeers();activeParticipants=f.ids.map(identity=>({identity,state:ParticipantInfo_State.ACTIVE,tracks:[],permission} as unknown as ParticipantInfo));
    await pool.query('UPDATE call_admissions SET connected_at=clock_timestamp(),disconnected_at=NULL WHERE id=ANY($1::text[])',[f.ids]);
    const ownPool=(lifecycleService as any).pool,connect=ownPool.connect,restoreClients:Array<()=>void>=[],reads:string[]=[];
    ownPool.connect=function(...args:any[]){const acquired=Reflect.apply(connect,this,args);return acquired.then((client:pg.PoolClient)=>{const query=client.query;client.query=function(...queryArgs:any[]){if(typeof queryArgs[0]?.name==='string'&&queryArgs[0].name.startsWith('fg_live_call_admission'))reads.push(queryArgs[0].name);return Reflect.apply(query,this,queryArgs);} as typeof client.query;restoreClients.push(()=>{client.query=query;});return client;});};
    const originalRpc=RoomServiceClient.prototype.updateParticipant,rpcs:string[]=[];RoomServiceClient.prototype.updateParticipant=async function(_room:string,id:string){rpcs.push(id);return {} as any;};
    try{await reconcile(f.callId);expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[f.callId])).rowCount).toBe(6);expect(rpcs).toEqual([]);expect(reads).toHaveLength(1);expect(reads[0]).toBe('fg_live_call_admission_policies_v1');observations.push({kind:'samePassEligibilityAndNoopPolicy',sixMembersRetained:true,reads:[...reads],nativeMutations:0});}
    finally{ownPool.connect=connect;for(const restore of restoreClients)restore();RoomServiceClient.prototype.updateParticipant=originalRpc;}
  });
  it('shared eligibility snapshot still rechecks each changed native policy after earlier peer revocation',async()=>{
    const f=await seedPolicyPeers();activeParticipants=f.ids.map(identity=>({identity,state:ParticipantInfo_State.ACTIVE,tracks:[],permission:{...permission,canPublish:false,canPublishSources:[]}} as unknown as ParticipantInfo));
    await pool.query('UPDATE call_admissions SET connected_at=clock_timestamp(),disconnected_at=NULL WHERE id=ANY($1::text[])',[f.ids]);
    const originalRpc=RoomServiceClient.prototype.updateParticipant,rpcs:string[]=[];RoomServiceClient.prototype.updateParticipant=async function(_room:string,id:string){rpcs.push(id);if(id===f.ids[0])await pool.query('UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id=$1',[f.ids[1]]);return {} as any;};
    try{await reconcile(f.callId);expect(rpcs).toEqual([f.ids[0],...f.ids.slice(2)]);expect((await row(f.ids[1])).revoked_at).not.toBeNull();observations.push({kind:'sharedSnapshotFreshNativeMutation',mutations:rpcs.length,secondRevokedPeerSkipped:true});}
    finally{RoomServiceClient.prototype.updateParticipant=originalRpc;}
  });
`;
const end=old.lastIndexOf('});');assert(end>0);const next=old.slice(0,end)+added+old.slice(end);assert.equal(next.replace(added,''),old);fs.mkdirSync(d+'/lifecycle-policy-reuse-tests1');put('lifecycle-policy-reuse-tests1/t30-lifecycle-policy-reuse.integration.spec.ts',next);
put('lifecycle-policy-reuse-jest1.config.cjs',read('policy-noop-batch-jest1.config.cjs').replaceAll('policy-noop-batch-tests1','lifecycle-policy-reuse-tests1').replaceAll('jest-policy-noop-batch1','jest-lifecycle-policy-reuse1'));
put('run-lifecycle-policy-reuse1.mjs',read('run-policy-noop-batch1.mjs').replaceAll('policy-noop-batch-jest1','lifecycle-policy-reuse-jest1').replaceAll('policy-noop-batch-tests1','lifecycle-policy-reuse-tests1').replaceAll('t30-policy-noop-batch.integration','t30-lifecycle-policy-reuse.integration'));
put('supabase-test-resource178.mjs',read('supabase-test-resource177.mjs').replaceAll('resource177','resource178'));
let driver=read('run-policy-noop-batch-red-resource127.mjs').replaceAll('resource127','resource178').replaceAll('stop-127','stop-178').replaceAll('restore-127','restore-178').replaceAll('t30-policy-noop-batch-red-1','t30-lifecycle-policy-reuse-red-1').replaceAll('run-policy-noop-batch1.mjs','run-lifecycle-policy-reuse1.mjs');put('run-lifecycle-policy-reuse-red-resource178.mjs',driver);
put('lifecycle-policy-reuse-test-review1.json',JSON.stringify({at:new Date().toISOString(),oldTenByteExact:true,oldSha256:createHash('sha256').update(old).digest('hex'),newSha256:createHash('sha256').update(next).digest('hex'),newControls:2,realPg:true,controlledNativeSdk:true,nativeAcceptance:false},null,2)+'\n');
fs.appendFileSync('../.doc/history.md','\n- Tiếp tục đến hết task FG — T30 — '+new Date().toISOString()+': priority24 actualexit1 fourthjoin25s, not accepted; exact ownedpriority restored0 and Supabase177 restored. Prepare two realPG lifecycle policy reuse controls before source edits, existing10cases byte unchanged. One same-pass six-peer no-op read plus native mutation freshness after revocation. Evidence code/'+d+'/lifecycle-policy-reuse-test-review1.json; RED required, noPASS/noT31.\n');
console.log('Two meaningful PostgreSQL controls prepared; original ten cases unchanged.');
