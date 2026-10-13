import {describe,it,expect} from 'vitest';
import * as wire from '../src/index.js';
import type {z} from 'zod';
const schema=(wire as unknown as {LobbyStoredMessageSchema:z.ZodType}).LobbyStoredMessageSchema;
const message={version:1,conversationId:'lobby',messageId:'message',content:'public after decrypt',attachments:[{id:'image',fileName:'image.webp',fileSize:128,mimeType:'image/webp'}]};
describe('Authenticated Lobby decoded storage contract',()=>{
 it('bounds normal text and normalized image metadata without changing the public plaintext DTO',()=>{expect(schema.parse(message)).toEqual(message);for(const changed of [{...message,content:'x'.repeat(2001)},{...message,attachments:Array(5).fill(message.attachments[0])},{...message,attachments:[{...message.attachments[0],fileSize:5*1024*1024+1}]}])expect(schema.safeParse(changed).success).toBe(false);});
 it('rejects private keys, arbitrary filenames/URLs and non-WebP attachment labels',()=>{for(const extra of [{privateKey:'key'},{source:'E2EE'}])expect(schema.safeParse({...message,...extra}).success).toBe(false);for(const extra of [{fileName:'private-original.png'},{url:'https://outside.invalid'},{mimeType:'image/png'}])expect(schema.safeParse({...message,attachments:[{...message.attachments[0],...extra}]}).success).toBe(false);});
});
