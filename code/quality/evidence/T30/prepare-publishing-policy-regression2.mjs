import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let test=fs.readFileSync(d+'/publishing-policy-tests1/t30-publishing-fresh-policy.integration.spec.ts','utf8');assert(test.endsWith('});\n'));
const extra=`
  describe('Original SDK semantics and fresh authority between peers',()=>{
    const peer=(identity:string)=>({identity,state:ParticipantInfo_State.ACTIVE,tracks:[],permission:{canSubscribe:true,canPublish:false,canPublishSources:[],canPublishData:true,canUpdateMetadata:true}} as unknown as ParticipantInfo);
    it('matching current policy returns the exact known peer without SDK lookup or update',async()=>{
      const client=await pool.connect(),savedGet=RoomServiceClient.prototype.getParticipant;
      try{
        const fixture=await seedFixture(client),known=peer(fixture.peer1.admissionId);
        known.permission={canSubscribe:true,canPublish:true,canPublishSources:[TrackSource.MICROPHONE],canPublishData:false,canUpdateMetadata:false} as ParticipantInfo['permission'];
        RoomServiceClient.prototype.getParticipant=async()=>{throw new Error('Known peer lookup must not occur');};
        expect(await callsService.syncLiveNativePermissions(client,known)).toBe(known);
        expect(observedUpdates).toHaveLength(0);
      }finally{RoomServiceClient.prototype.getParticipant=savedGet;await client.query('ROLLBACK');client.release();}
    });
    it('native update rejection preserves the exact original error identity',async()=>{
      const client=await pool.connect(),savedUpdate=RoomServiceClient.prototype.updateParticipant;
      try{
        const fixture=await seedFixture(client),error=new Error('Controlled native update rejection');
        RoomServiceClient.prototype.updateParticipant=async()=>{throw error;};
        await expect(callsService.syncLiveNativePermissions(client,peer(fixture.peer1.admissionId))).rejects.toBe(error);
      }finally{RoomServiceClient.prototype.updateParticipant=savedUpdate;await client.query('ROLLBACK');client.release();}
    });
    it('original sync lookup retains benign not_found and exact other rejection identity',async()=>{
      const client=await pool.connect(),savedGet=RoomServiceClient.prototype.getParticipant;
      try{
        const fixture=await seedFixture(client),lease=(await leaseStore.liveLease(client,fixture.peer1.admissionId))!;
        RoomServiceClient.prototype.getParticipant=async()=>{throw Object.assign(new Error('Controlled gone'),{code:'not_found'});};
        expect(await callsService.syncNativePermissions(client,lease)).toBeUndefined();
        const error=new Error('Controlled lookup rejection');RoomServiceClient.prototype.getParticipant=async()=>{throw error;};
        await expect(callsService.syncNativePermissions(client,lease)).rejects.toBe(error);
        expect(observedUpdates).toHaveLength(0);
      }finally{RoomServiceClient.prototype.getParticipant=savedGet;await client.query('ROLLBACK');client.release();}
    });
    it('next peer freshly observes session expiry after the previous awaited native update',async()=>{
      const client=await pool.connect(),savedUpdate=RoomServiceClient.prototype.updateParticipant;
      try{
        const fixture=await seedFixture(client),peers=[peer(fixture.peer1.admissionId),peer(fixture.peer2.admissionId)];
        RoomServiceClient.prototype.updateParticipant=async function(...args){
          const result=await savedUpdate.apply(this,args);
          await client.query("UPDATE session SET expires_at=now()-interval '10 seconds' WHERE id=$1",[fixture.peer2.sessionId]);
          return result;
        };
        await publishingService.reconcileWithin(client,fixture.callId,peers,new Date());
        expect(observedUpdates.map(x=>x.identity)).toEqual([fixture.peer1.admissionId]);
        expect(await leaseStore.liveLease(client,fixture.peer2.admissionId)).toBeUndefined();
      }finally{RoomServiceClient.prototype.updateParticipant=savedUpdate;await client.query('ROLLBACK');client.release();}
    });
  });
`;
test=test.slice(0,-4)+extra+'});\n';const target=d+'/publishing-policy-tests2';fs.mkdirSync(target);fs.writeFileSync(target+'/t30-publishing-fresh-policy.integration.spec.ts',test,{flag:'wx'});
fs.writeFileSync(d+'/publishing-policy-jest2.config.cjs',fs.readFileSync(d+'/publishing-policy-jest1.config.cjs','utf8').replaceAll('publishing-policy-tests1','publishing-policy-tests2').replaceAll('jest-publishing-policy1','jest-publishing-policy2'),{flag:'wx'});
fs.writeFileSync(d+'/run-publishing-policy2.mjs',fs.readFileSync(d+'/run-publishing-policy1.mjs','utf8').replaceAll('publishing-policy-jest1','publishing-policy-jest2').replaceAll('publishing-policy-tests1','publishing-policy-tests2'),{flag:'wx'});
fs.writeFileSync(d+'/snapshot-api-build11.mjs',fs.readFileSync(d+'/snapshot-api-build10.mjs','utf8').replaceAll('api-build-before-10','api-build-before-11'),{flag:'wx'});
let build=fs.readFileSync(d+'/adopt-api-build-10-reviewed1.mjs','utf8');const old="allowed=['apps/api/dist/modules/calls/lease-store.js','apps/api/dist/modules/calls/lease-store.js.map','apps/api/dist/modules/calls/lease-store.d.ts','apps/api/dist/modules/calls/signaling-gateway.js','apps/api/dist/modules/calls/signaling-gateway.js.map']";assert(build.includes(old));
build=build.replace(old,"allowed=['apps/api/dist/modules/calls/calls.service.js','apps/api/dist/modules/calls/calls.service.js.map','apps/api/dist/modules/calls/calls.service.d.ts','apps/api/dist/modules/calls/publishing.service.js','apps/api/dist/modules/calls/publishing.service.js.map']").replaceAll('api-build-10','api-build-11').replaceAll('api-build-before-10','api-build-before-11').replace('Actual API build from reviewed T30 fresh frame lease-policy GREEN11 and original guard regressions: only appended full guard-equivalent single fresh lease/policy helper and exact everyframe processBatch call; all other compiled bytes unchanged','Actual API build from reviewed T30 publishing per-peer fresh combined lease-policy GREEN11: only shared original private permission update helper, new fresh per-peer permission synchronization and final publishing peer loop; all other compiled bytes unchanged').replace('only reviewed calls.service.js/.map, lease-store.js/.map/.d.ts and call-lifecycle.service.js/.map changed','only reviewed calls.service.js/.map/.d.ts and publishing.service.js/.map changed').replace('API seven build files','API five build files');
fs.writeFileSync(d+'/adopt-api-build-11-reviewed1.mjs',build,{flag:'wx'});
console.log('Added four SDK/fresh-between-peer regressions preserving prior seven tests; build11 tools ready.');
