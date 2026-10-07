import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';
const route=(method:string,path:string)=>c.ApiEndpointRegistry.find(r=>r.method===method&&r.path===path);
const sample={id:'request',recruitmentId:'card',applicantId:'member',status:'PENDING',createdAt:'2026-10-07T00:00:00Z'};
describe('T03-FIX11 current-member play session transport',()=>{
 it('declares member join without admitting or accepting client identities',()=>{
  const endpoint=route('POST','/api/v1/play-sessions/:id/join');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomMember');expect(endpoint?.responseSchema).toBe(c.JoinRequestSchema);
  expect(endpoint?.responseSchema?.parse(sample)).toEqual(sample);
  expect(endpoint?.requestSchema?.parse({})).toEqual({});
  for(const body of [{userId:'other'},{roomId:'other'},{status:'ACCEPTED'},{recruitmentId:'other'}])expect(endpoint?.requestSchema?.safeParse(body).success).toBe(false);
 });
 it('declares current owner/exact recruitment helper queue using existing request DTOs',()=>{
  const endpoint=route('GET','/api/v1/play-sessions/:id/requests');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBe('MANAGE_RECRUITMENT');
  expect(endpoint?.responseSchema?.parse([sample])).toEqual([sample]);expect(endpoint?.responseSchema?.safeParse([{...sample,status:'APPROVED'}]).success).toBe(false);
 });
 it('requires exact delegated permission for response and rejects actor/status overrides',()=>{
  const endpoint=route('POST','/api/v1/play-sessions/:id/requests/:requestId/respond');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBe('MANAGE_RECRUITMENT');expect(endpoint?.responseSchema).toBe(c.JoinRequestSchema);
  for(const action of ['ACCEPT','REJECT'])expect(endpoint?.requestSchema?.parse({action})).toEqual({action});
  for(const body of [{},{action:'CANCEL'},{action:'ACCEPT',applicantId:'other'},{action:'ACCEPT',status:'ACCEPTED'},{action:'REJECT',roomId:'other'}])expect(endpoint?.requestSchema?.safeParse(body).success).toBe(false);
 });
 it.each(['start','end','leave'])('%s rejects unrecognized lifecycle fields and keeps compatible empty bodies',action=>{
  const endpoint=route('POST',`/api/v1/play-sessions/:id/${action}`);expect(endpoint).toBeDefined();
  expect(endpoint?.requestSchema?.parse({})).toEqual({});expect(endpoint?.requestSchema?.parse(undefined)).toEqual({});expect(endpoint?.requestSchema?.safeParse({userId:'other'}).success).toBe(false);expect(endpoint?.requestSchema?.safeParse(null).success).toBe(false);
  if(action==='leave')expect(endpoint?.responseSchema?.parse({success:true})).toEqual({success:true});
  else{expect(endpoint?.responseSchema).toBe(c.PlaySessionSchema);expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBe('MANAGE_RECRUITMENT');}
 });
 it('retains existing public request, invitation and member snapshot contracts',()=>{
  expect(route('POST','/api/v1/recruitments/:id/requests')?.responseSchema).toBe(c.JoinRequestSchema);
  expect(route('POST','/api/v1/join-requests/:id/approve')?.responseSchema).toBe(c.JoinRequestSchema);
  expect(route('GET','/api/v1/play-sessions/:id')?.responseSchema).toBe(c.TeamSnapshotSchema);expect(route('GET','/api/v1/play-sessions/:id')?.auth).toBe('RoomMember');
  expect(route('POST','/api/v1/invitations/:id/approve')?.responseSchema).toBe(c.InvitationSchema);
 });
});
