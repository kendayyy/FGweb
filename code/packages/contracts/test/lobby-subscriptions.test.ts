import {describe,it,expect} from 'vitest';
import * as contracts from '../src/index.js';
const added=contracts;
describe('T03-FIX3 Lobby and subscription boundaries',()=>{
 it('registers public game-ID history with the existing cursor/50-message page contract',()=>{
  const endpoint=contracts.ApiEndpointRegistry.find(item=>item.method==='GET'&&item.path==='/api/v1/games/:gameId/lobby/messages');
  expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('Public');
  expect(endpoint?.requestSchema?.parse({})).toEqual({limit:50});
  expect(endpoint?.requestSchema?.safeParse({limit:51}).success).toBe(false);
  expect(endpoint?.requestSchema?.safeParse({cursor:'bad cursor'}).success).toBe(false);
  expect(endpoint?.responseSchema.safeParse({items:[],nextCursor:null,hasMore:false}).success).toBe(true);
  expect(endpoint?.responseSchema.safeParse({items:[],nextCursor:null}).success).toBe(false);
 });
 it('keeps the title-based public Lobby alias and existing created-message event',()=>{
  const alias=contracts.ApiEndpointRegistry.find(item=>item.path==='/api/v1/lobby/messages');
  expect(alias?.requestSchema?.safeParse({gameTitle:'Valorant'}).success).toBe(true);
  expect(alias?.requestSchema?.safeParse({gameTitle:'unsupported'}).success).toBe(false);
  expect(contracts.SocketEventNames.MESSAGE_CREATED).toBe('message.created');
 });
 it('exports client event names and strict opaque conversation requests without identity overrides',()=>{
  expect(added.SocketEventNames.CONVERSATION_SUBSCRIBE).toBe('conversation.subscribe');
  expect(added.SocketEventNames.CONVERSATION_UNSUBSCRIBE).toBe('conversation.unsubscribe');
  const request=added.SocketConversationRequestSchema;expect(request).toBeDefined();
  expect(request.parse({conversationId:'opaque-c'})).toEqual({conversationId:'opaque-c'});
  for(const input of [{conversationId:' '},{conversationId:'c',userId:'other'},{conversationId:'c',roomId:'r'}])expect(request.safeParse(input).success).toBe(false);
 });
 it('acknowledges authorization errors without a fake success or ambiguous payload',()=>{
  const ack=added.SocketConversationAckSchema;expect(ack).toBeDefined();
  const error={code:contracts.ErrorCode.FORBIDDEN,message:'Access denied',requestId:'req-1'};
  expect(ack.parse({ok:false,error})).toEqual({ok:false,error});
  expect(ack.parse({ok:true,conversationId:'c'})).toEqual({ok:true,conversationId:'c'});
  for(const input of [{ok:true},{ok:false},{ok:true,conversationId:'c',error},{ok:false,error:{...error,code:'MADE_UP'}}])expect(ack.safeParse(input).success).toBe(false);
 });
});
