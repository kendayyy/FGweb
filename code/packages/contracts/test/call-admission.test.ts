import {describe,it,expect} from 'vitest';
import * as Contracts from '../src/index.js';
const actions=[
 {path:'/api/v1/rooms/:roomId/calls',auth:'RoomMember'},
 {path:'/api/v1/calls/:id/join',auth:'RoomMember'},
 {path:'/api/v1/calls/:id/leave',auth:'CallParticipant'},
];
describe.each(actions)('T03-FIX14 $path',({path,auth})=>{
 const endpoint=Contracts.ApiEndpointRegistry.find(e=>e.path===path&&e.method==='POST');
 it('accepts the explicit empty action and preserves membership authorization',()=>{
  expect(endpoint?.auth).toBe(auth);
  expect(endpoint?.requestSchema?.safeParse({}).success).toBe(true);
  expect(endpoint?.requestSchema?.parse({})).toEqual({});
 });
 it('rejects client authority and malformed actions rather than silently stripping input',()=>{
  expect(endpoint?.requestSchema).toBeDefined();
  for(const value of [{userId:'victim'},{sessionId:'other'},{capacity:11},{roomId:'elsewhere'},{callId:'elsewhere'},{role:'owner'},{identity:'old-lease'},{token:'forged'},{sfuUrl:'ws://other'},{muted:false},null,[],true,'',1]){
   expect(endpoint?.requestSchema?.safeParse(value).success,JSON.stringify(value)).toBe(false);
  }
 });
});
describe('T03-FIX14 response compatibility and action export',()=>{
 it('exports the same schema that all three mutations consume',()=>{
  expect(Contracts).toHaveProperty('CallActionRequestSchema');
  const schema=Reflect.get(Contracts,'CallActionRequestSchema');
  for(const {path}of actions)expect(Contracts.ApiEndpointRegistry.find(e=>e.path===path&&e.method==='POST')?.requestSchema).toBe(schema);
 });
 it('retains the existing call and join response contract without leaking lease/session data',()=>{
  const call={id:'call',roomId:'room',state:'OPEN',participantCount:10,publisherCount:3,hasExternalLive:false,createdAt:'2026-10-08T00:00:00Z'};
  const join={callId:'call',token:'short-lived-media-token',sfuUrl:'ws://localhost:18080/api/media',roomName:'opaque-room'};
  expect(Contracts.CallGroupSchema.parse(call)).toEqual(call);
  expect(Contracts.CallJoinSchema.parse(join)).toEqual(join);
  expect(Contracts.CallGroupSchema.safeParse({...call,participantCount:11}).success).toBe(false);
  expect(Contracts.CallGroupSchema.safeParse({...call,publisherCount:4}).success).toBe(false);
  expect(Contracts.ApiEndpointRegistry.find(e=>e.path===actions[1].path)?.responseSchema.parse(join)).toEqual(join);
 });
 it('retains member-only call discovery and the leave success response',()=>{
  const list=Contracts.ApiEndpointRegistry.find(e=>e.method==='GET'&&e.path===actions[0].path);
  expect(list?.auth).toBe('RoomMember');expect(list?.responseSchema.parse([])).toEqual([]);
  const leave=Contracts.ApiEndpointRegistry.find(e=>e.method==='POST'&&e.path===actions[2].path);
  expect(leave?.responseSchema.parse({success:true})).toEqual({success:true});
 });
});
