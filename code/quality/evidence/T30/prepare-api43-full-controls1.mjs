import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let original=fs.readFileSync(d+'/probe-api42-full2.mjs','utf8');
for(const loader of ['cjs','esm']){
 let s=original.replaceAll('api42-observer-reviewed2.mjs','api43-observer-reviewed1.mjs').replaceAll('api42-full-controls2','api43-full-controls1-'+loader);
 assert(s.includes("import { RoomServiceClient } from 'livekit-server-sdk';"));
 s=s.replace("import { RoomServiceClient } from 'livekit-server-sdk';","import { RoomServiceClient as EsmRoomServiceClient } from 'livekit-server-sdk';import {createRequire} from 'node:module';const CjsRoomServiceClient=createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js',import.meta.url))('livekit-server-sdk').RoomServiceClient;const RoomServiceClient="+(loader==='cjs'?'CjsRoomServiceClient':'EsmRoomServiceClient')+';');
 s=s.replace('instrumentRoomServiceClient(RoomServiceClient, evidenceDir);','instrumentRoomServiceClient([EsmRoomServiceClient,CjsRoomServiceClient], evidenceDir);');
 fs.writeFileSync(d+'/probe-api43-full1-'+loader+'.mjs',s,{flag:'wx'});
 let runner=fs.readFileSync(d+'/run-api42-full-controls2.mjs','utf8').replaceAll('probe-api42-full2.mjs','probe-api43-full1-'+loader+'.mjs').replaceAll('api42-full-controls2','api43-full-controls1-'+loader).replaceAll('api42-full-controls-review2.json','api43-full-controls-review1-'+loader+'.json').replaceAll('api42-observer-reviewed2.mjs','api43-observer-reviewed1.mjs');
 if(loader==='esm')runner=runner.replace("['normal','write-io','short-write','buffer-drop','final-health-io']","['normal']");fs.writeFileSync(d+'/run-api43-full-controls1-'+loader+'.mjs',runner,{flag:'wx'});
}
console.log('Immutable dual-loader full-control copies prepared, no tests executed.');
