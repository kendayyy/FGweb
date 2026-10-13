import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),put=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'}),old=read('lifecycle-policy-reuse-tests1/t30-lifecycle-policy-reuse.integration.spec.ts');
const added=`
  it('native screen end removes its slot then re-reads policy instead of retaining shared screen permission',async()=>{
    const f=await seedControlledCall(),slot=randomUUID(),screenPermission={...permission,canPublishSources:[2,3]};
    await pool.query('UPDATE call_admissions SET connected_at=clock_timestamp(),disconnected_at=NULL WHERE id=$1',[f.admissionId]);
    await pool.query('INSERT INTO call_publish_slots(id,call_group_id,user_id,ordinal) VALUES($1,$2,$3,1)',[slot,f.callId,f.fixtureUser]);
    activeParticipants=[{identity:f.admissionId,state:ParticipantInfo_State.ACTIVE,tracks:[{source:3,type:1,sid:'controlled-screen'}],permission:screenPermission} as unknown as ParticipantInfo];
    await reconcile(f.callId);
    activeParticipants=[{identity:f.admissionId,state:ParticipantInfo_State.ACTIVE,tracks:[],permission:screenPermission} as unknown as ParticipantInfo];
    const originalRpc=RoomServiceClient.prototype.updateParticipant,mutations:Array<{id:string;sources:number[]}>=[];RoomServiceClient.prototype.updateParticipant=async function(_room:string,id:string,options:any){mutations.push({id,sources:[...options.permission.canPublishSources]});return {} as any;};
    try{await reconcile(f.callId);expect((await pool.query('SELECT id FROM call_publish_slots WHERE id=$1',[slot])).rowCount).toBe(0);expect(mutations).toEqual([{id:f.admissionId,sources:[2]}]);observations.push({kind:'sharedSnapshotInvalidatedAfterSlotDelete',slotDeleted:true,freshMicrophoneOnlyNativePermission:true});}
    finally{RoomServiceClient.prototype.updateParticipant=originalRpc;}
  });
`;
const end=old.lastIndexOf('});');assert(end>0);const next=old.slice(0,end)+added+old.slice(end);assert.equal(next.replace(added,''),old);fs.mkdirSync(d+'/lifecycle-policy-reuse-tests2');put('lifecycle-policy-reuse-tests2/t30-lifecycle-policy-reuse.integration.spec.ts',next);
put('lifecycle-policy-reuse-jest2.config.cjs',read('lifecycle-policy-reuse-jest1.config.cjs').replaceAll('lifecycle-policy-reuse-tests1','lifecycle-policy-reuse-tests2').replaceAll('jest-lifecycle-policy-reuse1','jest-lifecycle-policy-reuse2'));
put('run-lifecycle-policy-reuse2.mjs',read('run-lifecycle-policy-reuse1.mjs').replaceAll('lifecycle-policy-reuse-jest1','lifecycle-policy-reuse-jest2').replaceAll('lifecycle-policy-reuse-tests1','lifecycle-policy-reuse-tests2'));
put('supabase-test-resource179.mjs',read('supabase-test-resource178.mjs').replaceAll('resource178','resource179'));
put('run-lifecycle-policy-reuse-red-resource179.mjs',read('run-lifecycle-policy-reuse-red-resource178.mjs').replaceAll('resource178','resource179').replaceAll('stop-178','stop-179').replaceAll('restore-178','restore-179').replaceAll('lifecycle-policy-reuse-red-1','lifecycle-policy-reuse-red-2').replaceAll('run-lifecycle-policy-reuse1.mjs','run-lifecycle-policy-reuse2.mjs'));
console.log('Additional real PostgreSQL native-screen-end freshness control; prior twelve tests byte unchanged.');
