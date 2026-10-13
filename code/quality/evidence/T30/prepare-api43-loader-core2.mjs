import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30';let s=fs.readFileSync(d+'/probe-api43-loader-core1.mjs','utf8');
const anchor="observer.instrumentOwnedApiPools(pg,folder);observer.instrumentRoomServiceClient(helper==='api43-observer-reviewed1.mjs'?[EsmRoomServiceClient,RoomServiceClient]:EsmRoomServiceClient,folder);";assert(s.includes(anchor));
s=s.replace(anchor,`observer.instrumentOwnedApiPools(pg,folder);
 const names=['listRooms','listParticipants','getParticipant','updateParticipant','removeParticipant','deleteRoom'],sdkBefore=names.map(n=>[EsmRoomServiceClient.prototype[n],RoomServiceClient.prototype[n]]);let validationError;
 try{observer.instrumentRoomServiceClient([EsmRoomServiceClient,function InvalidSdk(){}],folder);}catch(e){validationError=e;}
 test('invalidLaterConstructorRejectedBeforeAnyMutation',()=>{assert(validationError);for(let i=0;i<names.length;i++){assert.equal(EsmRoomServiceClient.prototype[names[i]],sdkBefore[i][0]);assert.equal(RoomServiceClient.prototype[names[i]],sdkBefore[i][1]);}});
 observer.instrumentRoomServiceClient([EsmRoomServiceClient,RoomServiceClient,EsmRoomServiceClient,RoomServiceClient],folder);`);
const stop='const beforePool=pg.Pool;';assert(s.includes(stop));s=s.replace(stop,`const installed=names.map(n=>[EsmRoomServiceClient.prototype[n],RoomServiceClient.prototype[n]]);let sdkDuplicate;
 try{observer.instrumentRoomServiceClient([EsmRoomServiceClient,RoomServiceClient],folder);}catch(e){sdkDuplicate=e;}
 test('duplicateSdkInstallerRejectedBeforeAnyMutation',()=>{assert(sdkDuplicate);for(let i=0;i<names.length;i++){assert.equal(EsmRoomServiceClient.prototype[names[i]],installed[i][0]);assert.equal(RoomServiceClient.prototype[names[i]],installed[i][1]);}});
 `+stop);
s=s.replace("folder=d+'/api43-loader-core-'","folder=d+'/api43-loader-core2-'");fs.writeFileSync(d+'/probe-api43-loader-core2.mjs',s,{flag:'wx'});console.log('17-case dual-loader/prevalidation/dedup/duplicate control prepared.');
