import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';
const route=(method:string,path:string)=>c.ApiEndpointRegistry.find(r=>r.method===method&&r.path===path);
const base={id:'invite',senderId:'sender',receiverId:'receiver',roomId:'room',status:'PENDING',createdAt:'2026-10-07T00:00:00Z'};
describe('T03-FIX10 invitation consent and transport',()=>{
 it.each(['ROOM','PLAY_SESSION'])('preserves optional server consent for %s without breaking old payloads',targetType=>{
  const data={...base,targetType,...(targetType==='PLAY_SESSION'?{playSessionId:'play'}:{})};
  expect(c.InvitationSchema.safeParse(data).success).toBe(true);
  const consent={...data,recipientAcceptedAt:'2026-10-07T00:01:00Z'};
  expect(c.InvitationSchema.parse(consent)).toEqual(consent);
  expect(c.InvitationSchema.safeParse({...consent,recipientAcceptedAt:'not-a-date'}).success).toBe(false);
 });
 it('declares member-only settings read with the existing schema',()=>{
  const endpoint=route('GET','/api/v1/rooms/:id/settings');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomMember');expect(endpoint?.responseSchema).toBe(c.RoomSettingsSchema);
  expect(route('PATCH','/api/v1/rooms/:id/settings')?.responseSchema).toBe(c.RoomSchema);
 });
 it('declares owner-only PUT grants as compatible with old PATCH',()=>{
  for(const method of ['PUT','PATCH']){
   const endpoint=route(method,'/api/v1/rooms/:id/helpers/:userId');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomOwner');expect(endpoint?.responseSchema).toBe(c.RoomMemberSchema);expect(endpoint?.requestSchema).toBe(c.UpdateHelperPermissionsRequestSchema);
   expect(endpoint?.requestSchema?.safeParse({permissions:['OWNER_TRANSFER']}).success).toBe(false);
  }
 });
 it('maps exact delegated approval rights by target and retains the existing action transport',()=>{
  const permission=(c as unknown as Record<string,unknown>).InvitationApprovalPermissionByTarget;
  expect(permission).toEqual({ROOM:'MANAGE_MEMBERS',PLAY_SESSION:'MANAGE_RECRUITMENT'});
  const endpoint=route('POST','/api/v1/invitations/:id/approve');expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBeUndefined();expect(endpoint?.responseSchema).toBe(c.InvitationSchema);
  expect(endpoint?.requestSchema?.parse({invitationId:'invite',action:'ACCEPT'})).toEqual({invitationId:'invite',action:'ACCEPT'});
 });
 it('keeps existing create/list/respond and owner-only lifecycle transports',()=>{
  expect(route('POST','/api/v1/invitations')?.requestSchema).toBe(c.CreateInvitationRequestSchema);
  expect(route('GET','/api/v1/invitations/me')?.auth).toBe('Authenticated');
  expect(route('PATCH','/api/v1/invitations/:id/respond')?.requestSchema).toBe(c.RespondInvitationSchema);
  expect(route('POST','/api/v1/rooms/:id/transfer-owner')?.auth).toBe('RoomOwner');
  expect(route('DELETE','/api/v1/rooms/:id')?.auth).toBe('RoomOwner');
 });
 it('rejects forged server consent/actor fields in invitation mutations',()=>{
  expect(c.CreateInvitationRequestSchema.safeParse({targetType:'ROOM',roomId:'room',receiverId:'receiver',recipientAcceptedAt:'2026-10-07T00:01:00Z'}).success).toBe(false);
  expect(c.RespondInvitationSchema.safeParse({action:'ACCEPT',receiverId:'other'}).success).toBe(false);
  expect(c.ApproveInvitationSchema.safeParse({invitationId:'invite',action:'ACCEPT',senderId:'owner'}).success).toBe(false);
 });
});
