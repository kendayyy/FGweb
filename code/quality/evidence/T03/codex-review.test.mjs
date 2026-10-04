import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import * as contracts from '../../../packages/contracts/dist/index.js';
test('actual recruitment endpoint rejects schedules already in the past at request time',async()=>{
 const route=contracts.ApiEndpointRegistry.find(r=>r.method==='POST'&&r.path==='/api/v1/recruitments');assert.ok(route?.requestSchema);await setTimeout(80);
 const payload={gameId:'g',gameTitle:'Valorant',title:'Team',mode:'Ranked',playerCapacity:5,timingType:'scheduledAt',scheduledAt:new Date(Date.now()-1).toISOString()};
 assert.equal(route.requestSchema.safeParse(payload).success,false,'registry captures module-load time and accepts an already-past schedule');
});
test('public room listing cannot serialize private room metadata',()=>{
 const route=contracts.ApiEndpointRegistry.find(r=>r.method==='GET'&&r.path==='/api/v1/rooms');
 const privateRoom={id:'r',name:'Private group',gameId:'g',gameTitle:'Valorant',ownerId:'u',settings:{visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:5},memberCount:2,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'};
 assert.ok(route);if(route.auth==='Public')assert.equal(route.responseSchema.safeParse({items:[privateRoom],nextCursor:null,hasMore:false}).success,false,'public response accepts PRIVATE room');
});
test('actual Lobby query rejects a game outside the seven approved games',()=>{
 const route=contracts.ApiEndpointRegistry.find(r=>r.method==='GET'&&r.path==='/api/v1/lobby/messages');assert.ok(route?.requestSchema);assert.equal(route.requestSchema.safeParse({gameTitle:'CS:GO'}).success,false);
});
