import {describe,it,expect} from 'vitest';
import {PlaySessionSchema,TeamSnapshotSchema,createPageSchema} from '../src/index.js';
const play={id:'play',roomId:'room',hostUserId:'host',timingType:'now',state:'ACTIVE',createdAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:00Z'};
describe('T03-FIX13 stored play session capacity transport',()=>{
 it('retains original DTO compatibility without fabricating room/default capacity',()=>{expect(PlaySessionSchema.parse(play)).toEqual(play);expect(PlaySessionSchema.parse(play).playerCapacity).toBeUndefined();});
 it('retains actual capacity1–10 in both member page and snapshot',()=>{for(const capacity of [1,3,10]){const item={...play,playerCapacity:capacity};expect(PlaySessionSchema.parse(item).playerCapacity).toBe(capacity);expect(TeamSnapshotSchema.parse({playSession:item,roster:[]}).playSession.playerCapacity).toBe(capacity);expect(createPageSchema(PlaySessionSchema).parse({items:[item],hasMore:false}).items[0].playerCapacity).toBe(capacity);}});
 it('rejects invalid capacity instead of silently stripping it',()=>{for(const capacity of [0,11,3.5,'3',null,-1])expect(PlaySessionSchema.safeParse({...play,playerCapacity:capacity}).success).toBe(false);});
});
