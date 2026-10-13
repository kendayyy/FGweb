import {describe,it,expect} from 'vitest';
import * as wire from '../src/index.js';
import type {z} from 'zod';
const c=wire as unknown as {SocketEventNames:Record<string,string>;SocketEventSchemaMap:Record<string,z.ZodType>;SocketCryptoConversationRequestSchema:z.ZodType;SocketCryptoConversationAckSchema:z.ZodType};
const b64=(n:number)=>Buffer.alloc(n,7).toString('base64').replace(/=+$/,'');
const message={id:'message',conversationId:'private',senderId:'alice',clientMessageId:'retry',deviceId:'A',membershipRevision:2,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:b64(128),session_id:b64(32)}},createdAt:'2026-10-08T00:00:00.000Z',attachmentIds:[],origin:'LIVE'};
describe('Device-bound private realtime contracts',()=>{
 it('limits the internal Redis wakeup to a queue discriminator and opaque source ID',()=>{
  const schema=(wire as unknown as {CryptoProtocolWakeSignalSchema:z.ZodType}).CryptoProtocolWakeSignalSchema;expect(schema).toBeDefined();
  for(const queue of ['ENCRYPTED','VERIFICATION'])expect(schema.parse({kind:'PROTOCOL_WAKE',queue,eventId:'event'})).toEqual({kind:'PROTOCOL_WAKE',queue,eventId:'event'});
  for(const payload of [{kind:'PROTOCOL_WAKE',queue:'OTHER',eventId:'event'},{kind:'PROTOCOL_WAKE',queue:'ENCRYPTED',eventId:''},{kind:'PROTOCOL_WAKE',queue:'ENCRYPTED',eventId:'event',ciphertext:'private'},{kind:'PROTOCOL_WAKE',queue:'ENCRYPTED',eventId:'event',recipientUserId:'bob'}])expect(schema.safeParse(payload).success).toBe(false);
 });
 it('registers a distinct strict ciphertext event without changing legacy message.created',()=>{
  expect(c.SocketEventNames.CRYPTO_MESSAGE_CREATED).toBe('crypto.message.created');
  expect(c.SocketEventSchemaMap['crypto.message.created']?.parse(message)).toEqual(message);
  expect(wire.SocketMessageCreatedPayloadSchema.safeParse(message).success).toBe(false);
 });
 it.each(['content','privateKey','recoveryCode','fileName','replyPreview'])('rejects %s in ciphertext events',key=>{
  expect(c.SocketEventSchemaMap['crypto.message.created']).toBeDefined();
  expect(c.SocketEventSchemaMap['crypto.message.created'].safeParse({...message,[key]:'secret'}).success).toBe(false);
 });
 it('requires a device on private subscribe/unsubscribe and rejects client owner/trust claims',()=>{
  const input={conversationId:'private',deviceId:'A'};
  expect(c.SocketEventNames.CRYPTO_SUBSCRIBE).toBe('crypto.subscribe');expect(c.SocketEventNames.CRYPTO_UNSUBSCRIBE).toBe('crypto.unsubscribe');
  expect(c.SocketEventSchemaMap['crypto.subscribe']?.parse(input)).toEqual(input);
  expect(c.SocketEventSchemaMap['crypto.unsubscribe']?.parse(input)).toEqual(input);
  for(const request of [{conversationId:'private'},{...input,userId:'alice'},{...input,verified:true},{...input,deviceId:'bad key'}])expect(c.SocketCryptoConversationRequestSchema.safeParse(request).success).toBe(false);
 });
 it('acknowledges the bound device/revision and uses existing strict error semantics',()=>{
  const ack={ok:true,conversationId:'private',deviceId:'A',membershipRevision:2};
  expect(c.SocketCryptoConversationAckSchema?.parse(ack)).toEqual(ack);
  expect(c.SocketCryptoConversationAckSchema.safeParse({...ack,membershipRevision:0}).success).toBe(false);
  expect(c.SocketCryptoConversationAckSchema.safeParse({ok:false,error:{code:'FORBIDDEN',message:'Access denied',requestId:'request'}}).success).toBe(true);
 });
 it('registers a metadata-only sync wakeup for the currently bound device and revision',()=>{
  expect(c.SocketEventNames.CRYPTO_SYNC_AVAILABLE).toBe('crypto.sync.available');const payload={conversationId:'private',deviceId:'A',membershipRevision:2};expect(c.SocketEventSchemaMap['crypto.sync.available']?.parse(payload)).toEqual(payload);
 });
 it.each(['content','privateKey','recoveryCode','ciphertext','eventId','recipientUserId','verificationEvent'])('rejects %s in sync wakeups',key=>{
  const schema=c.SocketEventSchemaMap['crypto.sync.available'];expect(schema).toBeDefined();expect(schema.safeParse({conversationId:'private',deviceId:'A',membershipRevision:2,[key]:'disallowed'}).success).toBe(false);
 });
 it('rejects missing device, invalid epoch and client transport overrides in sync wakeups',()=>{
  const schema=c.SocketEventSchemaMap['crypto.sync.available'];expect(schema).toBeDefined();for(const payload of [{conversationId:'private',membershipRevision:2},{conversationId:'private',deviceId:'A',membershipRevision:0},{conversationId:'private',deviceId:'bad key',membershipRevision:2},{conversationId:'private',deviceId:'A',membershipRevision:2,verified:true}])expect(schema.safeParse(payload).success).toBe(false);
 });
});


describe('Client-selected live private mention routing metadata',()=>{
 const send={clientMessageId:message.clientMessageId,deviceId:message.deviceId,membershipRevision:message.membershipRevision,envelope:message.envelope};
 it('accepts selected routing IDs on live sends/events while omitted fields keep old payloads intact',()=>{
  expect(wire.SendEncryptedMessageSchema.parse({...send,mentionedUserIds:['bob','carol']})).toEqual({...send,mentionedUserIds:['bob','carol']});expect(wire.EncryptedMessageSchema.parse({...message,mentionedUserIds:['bob']})).toEqual({...message,mentionedUserIds:['bob']});expect(wire.SendEncryptedMessageSchema.parse(send)).toEqual(send);expect(wire.EncryptedMessageSchema.parse(message)).toEqual(message);
 });
 it('bounds and deduplicates the selection and rejects private content/owner claims and live fields on legacy imports',()=>{
  for(const mentionedUserIds of [['bob','bob'],[''],['x'.repeat(129)],Array.from({length:1001},(_,index)=>'user-'+index)]){expect(wire.SendEncryptedMessageSchema.safeParse({...send,mentionedUserIds}).success).toBe(false);expect(wire.EncryptedMessageSchema.safeParse({...message,mentionedUserIds}).success).toBe(false);}
  for(const field of ['content','mentionPreview','privateKey','recoveryCode','senderId'])expect(wire.SendEncryptedMessageSchema.safeParse({...send,mentionedUserIds:['bob'],[field]:'disallowed'}).success).toBe(false);
  const legacy={...message,origin:'LEGACY_IMPORT',importProvenance:{candidateId:'candidate',cohortId:'cohort',originalSha256:b64(32),importerUserId:'alice',importerDeviceId:'A'}};expect(wire.EncryptedMessageSchema.safeParse({...legacy,mentionedUserIds:['bob']}).success).toBe(false);
 });
});
