import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';
const route=(method:string,path:string)=>c.ApiEndpointRegistry.find(r=>r.method===method&&r.path===path);
describe('T03-FIX9 team approval transport',()=>{
 it('declares actor-owned apply alias and retains original apply',()=>{
  for(const path of ['/api/v1/recruitments/:id/requests','/api/v1/recruitments/:id/join-requests']){
   const endpoint=route('POST',path);expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('Authenticated');expect(endpoint?.responseSchema).toBe(c.JoinRequestSchema);
  }
 });
 it.each(['approve','reject'])('declares %s as a path action with exact management permission',action=>{
  const endpoint=route('POST',`/api/v1/join-requests/:id/${action}`);expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBe('MANAGE_RECRUITMENT');expect(endpoint?.responseSchema).toBe(c.JoinRequestSchema);expect(endpoint?.requestSchema).toBeUndefined();
 });
 it('keeps legacy action transport compatible',()=>{
  const endpoint=route('PATCH','/api/v1/join-requests/:id/respond');expect(endpoint?.requestSchema?.parse({action:'ACCEPT'})).toEqual({action:'ACCEPT'});expect(endpoint?.requestSchema?.parse({action:'REJECT'})).toEqual({action:'REJECT'});expect(endpoint?.requiredPermission).toBe('MANAGE_RECRUITMENT');
 });
 it('uses the same validated snapshot schema for member REST and socket',()=>{
  const schema=(c as unknown as Record<string,typeof c.SocketTeamUpdatedPayloadSchema>).TeamSnapshotSchema;
  expect(schema).toBeDefined();const endpoint=route('GET','/api/v1/play-sessions/:id');expect(endpoint?.auth).toBe('RoomMember');expect(endpoint?.responseSchema).toBe(schema);expect(c.SocketTeamUpdatedPayloadSchema).toBe(schema);
  const snapshot={playSession:{id:'play',roomId:'room',hostUserId:'host',timingType:'now',state:'ACTIVE',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z'},roster:[{playSessionId:'play',userId:'host',slotIndex:1,isHost:true,joinedAt:'2026-10-07T00:00:00Z'}]};
  expect(schema?.safeParse(snapshot).success).toBe(true);expect(schema?.safeParse({...snapshot,roster:[{...snapshot.roster[0],slotIndex:11}]}).success).toBe(false);
 });
});
