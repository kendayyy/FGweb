import {describe,it,expect} from 'vitest';import * as contracts from '../../../packages/contracts/src/moderation.js';import type {z} from 'zod';
describe('T38 compatible shared delete reason request',()=>{
 const schema=Reflect.get(contracts,'DeleteMessageRequestSchema') as z.ZodType;
 it('exports a shared request instead of a frontend DTO copy',()=>{expect(schema).toBeDefined();});
 it('retains strict empty-body compatibility and accepts a bounded supplied reason',()=>{expect(schema.parse({})).toEqual({});expect(schema.parse({reason:'Vi phạm quy tắc cộng đồng'})).toEqual({reason:'Vi phạm quy tắc cộng đồng'});expect(schema.safeParse({reason:'x'.repeat(300)}).success).toBe(true);});
 it('rejects blank/oversized reasons and forged authority fields',()=>{for(const input of [{reason:''},{reason:'  '},{reason:'x'.repeat(301)},{reason:'Fixture reason',actorId:'forged'},{reason:'Fixture reason',admin:true}])expect(schema.safeParse(input).success).toBe(false);});
});
