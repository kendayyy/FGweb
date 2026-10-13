import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let s=fs.readFileSync(d+'/probe-api42-core2.mjs','utf8');
s=s.replace("import {RoomServiceClient} from 'livekit-server-sdk';","import {RoomServiceClient as EsmRoomServiceClient} from 'livekit-server-sdk';import {createRequire} from 'node:module';const RoomServiceClient=createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js',import.meta.url))('livekit-server-sdk').RoomServiceClient;");
s=s.replace("'api42-observer-reviewed2.mjs'].includes(helper)","'api42-observer-reviewed2.mjs','api43-observer-reviewed1.mjs'].includes(helper)").replace("folder=d+'/api42-core-'","folder=d+'/api43-loader-core-'");
s=s.replace('observer.instrumentRoomServiceClient(RoomServiceClient,folder)',"observer.instrumentRoomServiceClient(helper==='api43-observer-reviewed1.mjs'?[EsmRoomServiceClient,RoomServiceClient]:EsmRoomServiceClient,folder)");
s=s.replace('assert.equal(rpcs.length,2);',"test('compiledSdkRpcBothObserved',()=>assert.equal(rpcs.length,2));");s=s.replace('rpcs[0].backendPid','rpcs[0]?.backendPid').replace('rpcs[1].backendPid','rpcs[1]?.backendPid');
assert(s.includes('compiledSdkRpcBothObserved'));fs.writeFileSync(d+'/probe-api43-loader-core1.mjs',s,{flag:'wx'});console.log('Actual compiled SDK loader RED control prepared.');
