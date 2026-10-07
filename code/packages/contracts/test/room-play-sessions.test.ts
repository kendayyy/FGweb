import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';
const route=()=>c.ApiEndpointRegistry.find(r=>r.method==='GET'&&r.path==='/api/v1/rooms/:id/play-sessions');
const play={id:'play',roomId:'private-room',hostUserId:'host',timingType:'scheduledAt',scheduledAt:'2026-10-07T13:00:00Z',state:'SCHEDULED',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z'};
describe('T03-FIX12 member-only persistent-room session discovery',()=>{
 it('declares a current member read with no owner/helper-only gate or public access',()=>{
  const endpoint=route();expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomMember');expect(endpoint?.requiredPermission).toBeUndefined();
  expect(endpoint?.responseSchema?.parse({items:[],hasMore:false})).toEqual({items:[],hasMore:false});
 });
 it('accepts bounded cursor pagination, keeps defaults and rejects actor/room overrides',()=>{
  const schema=route()?.requestSchema;expect(schema).toBeDefined();expect(schema?.parse({})).toEqual({limit:20});expect(schema?.parse({limit:50,cursor:'cursor'})).toEqual({limit:50,cursor:'cursor'});
  for(const query of [{limit:0},{limit:51},{limit:1.5},{limit:'20'},{cursor:''},{cursor:'x'.repeat(501)},{userId:'other'},{roomId:'other'},{state:'PUBLIC'}])expect(schema?.safeParse(query).success).toBe(false);
 });
 it('uses existing play session DTOs for scheduled/active/ended history in Page responses',()=>{
  const schema=route()?.responseSchema;expect(schema).toBeDefined();
  for(const state of ['SCHEDULED','ACTIVE','ENDED'])expect(schema?.parse({items:[{...play,state}],hasMore:true,nextCursor:'next'})).toEqual({items:[{...play,state}],hasMore:true,nextCursor:'next'});
  expect(schema?.safeParse({items:[{...play,state:'PUBLIC'}],hasMore:false}).success).toBe(false);
 });
 it('keeps member snapshot, current manager queue and existing mutations unchanged',()=>{
  expect(c.ApiEndpointRegistry.find(r=>r.method==='GET'&&r.path==='/api/v1/play-sessions/:id')?.responseSchema).toBe(c.TeamSnapshotSchema);
  expect(c.ApiEndpointRegistry.find(r=>r.method==='GET'&&r.path==='/api/v1/play-sessions/:id/requests')?.requiredPermission).toBe('MANAGE_RECRUITMENT');
  expect(c.ApiEndpointRegistry.find(r=>r.method==='POST'&&r.path==='/api/v1/play-sessions/:id/start')?.requestSchema).toBe(c.PlaySessionActionRequestSchema);
 });
});
