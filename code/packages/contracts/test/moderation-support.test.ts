import {describe,it,expect} from 'vitest';import {z} from 'zod';import * as contracts from '../src/index.js';
const fixture={id:'fixture-user',displayName:'FG',customStatus:'JUST_CHATTING',createdAt:'2026-10-15T00:00:00.000Z',gameProfiles:[],email:'fixture@example.invalid',emailVerified:true,discordId:null,banned:true};
const schema=()=>{const result=(contracts as unknown as Record<string,z.ZodTypeAny>).AdminUserListItemSchema;expect(result,'Missing current admin user ban-state contract').toBeDefined();return result;};
describe('T37 sole-admin user list state contract',()=>{
 it('retains authoritative banned state in the admin item',()=>{expect(schema().parse(fixture)).toHaveProperty('banned',true);expect(schema().parse({...fixture,banned:false})).toHaveProperty('banned',false);});
 it('requires a real boolean rather than a client role or status string',()=>{expect(schema().safeParse({...fixture,banned:'true'}).success).toBe(false);expect(schema().safeParse({...fixture,banned:undefined}).success).toBe(false);});
 it('rejects password/session/provider secrets from the admin item',()=>{for(const field of ['password','token','accessToken','passwordHash'])expect(schema().safeParse({...fixture,[field]:'synthetic-secret-fixture'}).success).toBe(false);});
 it('uses the ban-aware item in the central admin list endpoint',()=>{schema();const endpoint=contracts.ApiEndpointRegistry.find(row=>row.path==='/api/v1/admin/users'&&row.method==='GET');expect(endpoint?.auth).toBe('Admin');const page=endpoint!.responseSchema.parse({items:[fixture],hasMore:false,nextCursor:null}) as {items:{banned?:boolean}[]};expect(page.items[0].banned).toBe(true);});
});

describe('T37 structured backend conflict and availability errors',()=>{
 it.each([['CONFLICT',409],['SERVICE_UNAVAILABLE',503],['INTERNAL_ERROR',500]] as const)('accepts %s with its real HTTP status',(code,status)=>{const error=contracts.ApiErrorResponseSchema.parse({code,message:'Safe generic error',requestId:'fixture-request'});expect(contracts.ErrorCodeToHttpStatus[error.code]).toBe(status);});
});
