import {describe,it,expect} from 'vitest';
import * as contracts from '../src/index.js';
import {MAX_IMAGE_SIZE_BYTES} from '../src/messages.js';
const route=(method:string,path:string)=>contracts.ApiEndpointRegistry.find(endpoint=>endpoint.method===method&&endpoint.path===path);
describe('approved protected image-upload contracts',()=>{
 it('requires conversation context and an actual multipart file, with no client ownership fields',()=>{
  const upload=route('POST','/api/v1/uploads/images');expect(upload?.requestSchema,'Upload must declare its request').toBeDefined();const schema=upload!.requestSchema!;
  const request={conversationId:'conversation',file:{bytes:new Uint8Array([1]),fileName:'photo.png',mimeType:'image/png'}};
  expect(schema.safeParse(request).success).toBe(true);expect(schema.safeParse({file:request.file}).success).toBe(false);expect(schema.safeParse({conversationId:'conversation'}).success).toBe(false);expect(schema.safeParse({...request,uploaderId:'someone-else'}).success).toBe(false);expect(schema.safeParse({...request,file:{...request.file,bytes:new Uint8Array(MAX_IMAGE_SIZE_BYTES+1)}}).success).toBe(false);expect(schema.safeParse({...request,file:{...request.file,mimeType:'image/svg+xml'}}).success).toBe(false);
 });
 it('declares protected metadata and binary content as distinct response transports',()=>{
  const metadata=route('GET','/api/v1/attachments/:id'),content=route('GET','/api/v1/attachments/:id/content');expect(metadata?.auth).toBe('ConversationRead');expect(metadata?.responseSchema.safeParse({url:'https://fg.example/api/v1/attachments/opaque/content'}).success).toBe(true);expect(content,'Protected content route must exist').toBeDefined();expect(content!.auth).toBe('ConversationRead');expect(content!.responseSchema.safeParse(new Uint8Array([1,2,3])).success).toBe(true);expect(content!.responseSchema.safeParse({url:'https://public.example/static/file.webp'}).success).toBe(false);
 });
});

