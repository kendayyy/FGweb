import {describe,it,expect} from 'vitest';
import * as wire from '../src/index.js';
import type {z} from 'zod';
const c=wire as unknown as {ReadChatReportSchema:z.ZodType;DisclosedReportSchema:z.ZodType;CryptoApiEndpointRegistry:Array<{path:string;auth:string;responseFormat?:string}>};
describe('Selected admin report disclosure contract',()=>{
 it('requires an empty server-bound read request and rejects client roles/keys/source selection',()=>{expect(c.ReadChatReportSchema.parse({})).toEqual({});for(const key of ['userId','admin','privateKey','conversationId'])expect(c.ReadChatReportSchema.safeParse({[key]:'untrusted'}).success).toBe(false);});
 it('returns only consented evidence with unverified authenticity and refuses extra private material',()=>{
  const item={evidenceId:'e',messageId:'m',conversationId:'c',text:'selected',reason:'report',source:'USER_DISCLOSED',authenticity:'USER_SUPPLIED_UNVERIFIED',reportAttachmentIds:['image']},report={id:'r',selectedMessages:[item]};
  expect(c.DisclosedReportSchema.parse(report)).toEqual(report);for(const extra of [{privateKey:'key'},{authenticity:'VERIFIED'},{source:'LIVE'}])expect(c.DisclosedReportSchema.safeParse({id:'r',selectedMessages:[{...item,...extra}]}).success).toBe(false);
 });
 it('registers distinct admin text/image reads without expanding private conversation access',()=>{
  expect(c.CryptoApiEndpointRegistry.find(p=>p.path==='/api/v1/crypto/reports/:reportId/read')?.auth).toBe('Admin');expect(c.CryptoApiEndpointRegistry.find(p=>p.path==='/api/v1/crypto/reports/:reportId/attachments/:attachmentId')?.responseFormat).toBe('binary');
 });
});
