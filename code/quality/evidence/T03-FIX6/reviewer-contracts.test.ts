import {describe,it,expect} from 'vitest';
import * as c from '../../../packages/contracts/src/index.js';
const peer={id:'u/a',displayName:'Bạn',avatarUrl:null,customStatus:'JUST_CHATTING'};
const entry={requestId:'opaque/request',sender:peer,receiver:{...peer,id:'u/b'},status:'PENDING',createdAt:'2026-10-06T02:00:00Z',updatedAt:'2026-10-06T02:00:00Z'};
const endpoint=()=>c.ApiEndpointRegistry.find(e=>e.method==='GET'&&e.path==='/api/v1/friends/requests');
describe('Codex independent pending-request transport review',()=>{
it('registers exactly one authenticated read endpoint without replacing mutation routes',()=>{
expect(c.ApiEndpointRegistry.filter(e=>e.method==='GET'&&e.path==='/api/v1/friends/requests')).toHaveLength(1);expect(endpoint()?.auth).toBe('Authenticated');
for(const [method,path]of [['POST','/api/v1/friends/requests'],['PATCH','/api/v1/friends/requests/:id/respond'],['DELETE','/api/v1/friends/requests/:id/cancel']])expect(c.ApiEndpointRegistry.filter(e=>e.method===method&&e.path===path)).toHaveLength(1);
});
it('validates directions and bounded numeric pagination rather than silently accepting invalid values',()=>{
const query=endpoint()?.requestSchema;expect(query).toBeDefined();expect(query!.parse({})).toMatchObject({direction:'INCOMING',limit:50});
for(const direction of ['INCOMING','OUTGOING'])expect(query!.safeParse({direction,limit:1,cursor:'opaque'}).success).toBe(true);
for(const input of [{direction:'ALL'},{direction:'incoming'},{limit:0},{limit:51},{limit:1.2},{limit:'10'}])expect(query!.safeParse(input).success).toBe(false);
});
it('projects only public summary data at both peer levels and strips private root data',()=>{
const response=endpoint()?.responseSchema;expect(response).toBeDefined();
const parsed=response!.parse({items:[{...entry,email:'hidden@example.com',sessionToken:'synthetic',sender:{...peer,email:'hidden@example.com',discordId:'private',sessionToken:'synthetic'},receiver:{...entry.receiver,email:'private@example.com',gameProfiles:[{}]}}],hasMore:false,nextCursor:null}) as {items:Array<Record<string,unknown>>};
expect(parsed.items[0]).toEqual(entry);
});
it('rejects nonpending states, broken UTC timestamps and missing peer identity in pages',()=>{
const response=endpoint()?.responseSchema;expect(response).toBeDefined();for(const item of [{...entry,status:'ACCEPTED'},{...entry,createdAt:'invalid'},{...entry,sender:{displayName:'No ID'}},{...entry,receiver:{...peer,id:''}}])expect(response!.safeParse({items:[item],hasMore:false,nextCursor:null}).success).toBe(false);
});
});
