import {describe,it,expect} from 'vitest';
import * as c from '../src/index.js';

const create={gameId:'game-opaque',gameTitle:'Valorant',title:'Tìm đội',mode:'ranked',playerCapacity:5,timingType:'now'};
describe('T03-FIX8 recruitment transports',()=>{
 it('preserves explicit existing-room selection while accepting new-room creation',()=>{
  expect(c.CreateRecruitmentSchema().parse({...create,roomId:'room-opaque'})).toHaveProperty('roomId','room-opaque');
  expect(c.CreateRecruitmentSchema().parse(create)).not.toHaveProperty('roomId');
  expect(c.CreateRecruitmentSchema().safeParse({...create,roomId:'  '}).success).toBe(false);
 });
 it('declares game-specific public cards and suggestions with validated public pagination',()=>{
  for(const path of ['/api/v1/games/:id/recruitments','/api/v1/games/:id/recruitments/suggestions']){
   const route=c.ApiEndpointRegistry.find(r=>r.path===path&&r.method==='GET');
   expect(route).toBeDefined();expect(route?.auth).toBe('Public');
   expect(route?.requestSchema?.safeParse({mode:'ranked',limit:50}).success).toBe(true);
   expect(route?.requestSchema?.safeParse({visibility:'PRIVATE'}).success).toBe(false);
   expect(route?.requestSchema?.safeParse({state:'CLOSED'}).success).toBe(false);
   expect(route?.requestSchema?.safeParse({limit:51}).success).toBe(false);
  }
 });
 it('declares permission-protected reopen without changing the original close route',()=>{
  for(const action of ['close','reopen']){
   const route=c.ApiEndpointRegistry.find(r=>r.path===`/api/v1/recruitments/:id/${action}`&&r.method==='PATCH');
   expect(route).toBeDefined();expect(route?.auth).toBe('RoomHelperOrOwner');
   expect(route?.requiredPermission).toBe('MANAGE_RECRUITMENT');
  }
 });
 it('preserves legacy discovery/create ACL metadata for existing and newly owned rooms',()=>{
  expect(c.ApiEndpointRegistry.find(r=>r.path==='/api/v1/recruitments'&&r.method==='GET')?.auth).toBe('Public');
  const post=c.ApiEndpointRegistry.find(r=>r.path==='/api/v1/recruitments'&&r.method==='POST');
  expect(post?.auth).toBe('RoomHelperOrOwner');
  expect(post?.requiredPermission).toBe('MANAGE_RECRUITMENT');
  expect(post?.requestSchema?.parse({...create,roomId:'room-selected'})).toHaveProperty('roomId','room-selected');
 });
 it('evaluates scheduled time on each request using the supplied clock',()=>{
  let now=new Date('2026-10-07T00:00:00Z');
  const schema=c.CreateRecruitmentSchema(()=>now);
  const scheduled={...create,timingType:'scheduledAt',scheduledAt:'2026-10-07T00:01:00Z'};
  expect(schema.safeParse(scheduled).success).toBe(true);
  now=new Date('2026-10-07T00:02:00Z');
  expect(schema.safeParse(scheduled).success).toBe(false);
 });
});

