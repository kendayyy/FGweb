import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ApiEndpointRegistry,RoomSchema,PublicRecruitmentSchema} from '@fg/contracts';
const date='2026-10-06T00:00:00.123456Z';
const room={id:'room_distinct',conversationId:'conv/opaque:separate?literal',name:'Nhóm',gameId:'valorant',gameTitle:'Valorant',ownerId:'owner',settings:{visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:5},memberCount:1,createdAt:date,updatedAt:date};
const {conversationId,...missing}=room;
let checked=0;
for(const [method,url,page]of [['POST','/api/v1/rooms',false],['GET','/api/v1/rooms/:id',false],['GET','/api/v1/rooms',true],['GET','/api/v1/rooms/own',true],['PATCH','/api/v1/rooms/:id/settings',false],['POST','/api/v1/rooms/:id/transfer-owner',false]]){
 const endpoint=ApiEndpointRegistry.find(e=>e.method===method&&e.path===url);assert(endpoint?.responseSchema);assert.notEqual(endpoint.auth,'Public');
 const valid=page?{items:[room],nextCursor:null,hasMore:false}:room;
 const invalid=page?{items:[missing],nextCursor:null,hasMore:false}:missing;
 const parsed=endpoint.responseSchema.parse(valid);assert.equal(page?parsed.items[0].conversationId:parsed.conversationId,conversationId);
 assert.equal(endpoint.responseSchema.safeParse(invalid).success,false);checked++;
}
for(const invalid of [undefined,null,'','   ',2])assert.equal(RoomSchema.safeParse({...room,conversationId:invalid}).success,false);
const card=PublicRecruitmentSchema.parse({id:'card',roomId:room.id,gameId:room.gameId,gameTitle:room.gameTitle,title:'Tìm đội',mode:'Ranked',playerCapacity:5,currentPlayers:1,timingType:'now',state:'OPEN',visibility:'PUBLIC',createdAt:date,updatedAt:date,conversationId,privateRoomDescription:'secret metadata'});
assert(!('conversationId'in card));assert(!('privateRoomDescription'in card));
const original=execFileSync('git',['show','HEAD:code/packages/contracts/test/contracts.test.ts'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
const current=fs.readFileSync('packages/contracts/test/contracts.test.ts','utf8').replace(/\r\n/g,'\n').replace("conversationId:'c',",'');
assert.equal(current,original,'Original acceptance test assertions unchanged except required fixture ID');
console.log(JSON.stringify({compiledRegistryRoomTransports:checked,opaqueIdentityPreserved:true,missingNullBlankNumericIdsRejected:true,publicCardPrivateFieldsStripped:true,originalAssertionsPreserved:true}));
