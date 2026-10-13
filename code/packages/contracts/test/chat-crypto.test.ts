import {describe,it,expect} from 'vitest';
import * as crypto from '../src/chat-crypto.js';
const b64=(n:number)=>Buffer.alloc(n,7).toString('base64').replace(/=+$/,'');
const encrypted={algorithm:'m.megolm.v1.aes-sha2',ciphertext:b64(128),session_id:b64(32),sender_key:b64(32),device_id:'DEVICE_A'};
const request={clientMessageId:'retry-id',deviceId:'DEVICE_A',membershipRevision:1,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:encrypted}};
describe('CHAT-CRYPTO-01 strict shared wire contracts',()=>{
 it('accepts a ciphertext-only private message with stable dedup identity and revision',()=>{expect(crypto.SendEncryptedMessageSchema.parse(request)).toEqual(request);});
 it.each(['content','text','fileName','thumbnail','replyPreview','privateKey','recoveryCode'])('rejects leaked %s rather than silently stripping it',key=>{expect(crypto.SendEncryptedMessageSchema.safeParse({...request,[key]:'PRIVATE'}).success).toBe(false);});
 it.each([0,-1,1.2,Number.MAX_SAFE_INTEGER+1])('rejects unsafe revision %s',membershipRevision=>{expect(crypto.SendEncryptedMessageSchema.safeParse({...request,membershipRevision}).success).toBe(false);});
 it('rejects unknown protocol versions and oversized or invalid ciphertext',()=>{
  for(const envelope of [{...request.envelope,version:2},{...request.envelope,protocol:'CUSTOM_AES'},{...request.envelope,event:{...encrypted,ciphertext:'not base64 !'}},{...request.envelope,event:{...encrypted,ciphertext:'A'.repeat(crypto.MAX_CRYPTO_EVENT_BASE64_CHARS+1)}}])expect(crypto.SendEncryptedMessageSchema.safeParse({...request,envelope}).success).toBe(false);
 });
 it('Lobby storage envelope identifies Transit/key version and cannot masquerade as E2EE',()=>{
  const lobby={version:1,protocol:'OPENBAO_TRANSIT_AES256GCM',keyId:'fg-lobby',keyVersion:1,ciphertext:`vault:v1:${Buffer.alloc(40).toString('base64')}`};
  expect(crypto.LobbyStorageEnvelopeSchema.safeParse(lobby).success).toBe(true);
  expect(crypto.PrivateMessageEnvelopeSchema.safeParse(lobby).success).toBe(false);
  expect(crypto.LobbyStorageEnvelopeSchema.safeParse({...lobby,keyVersion:2}).success).toBe(false);
 });
 it('upload descriptor has no image key, filename, pixels or thumbnail',()=>{
  const upload={clientUploadId:'upload',deviceId:'DEVICE_A',membershipRevision:1,ciphertextSize:5242880,ciphertextSha256:b64(32)};
  expect(crypto.EncryptedUploadRequestSchema.safeParse(upload).success).toBe(true);
  for(const key of ['key','iv','fileName','mimeType','width','thumbnail'])expect(crypto.EncryptedUploadRequestSchema.safeParse({...upload,[key]:'secret'}).success).toBe(false);
  expect(crypto.EncryptedUploadRequestSchema.safeParse({...upload,ciphertextSize:5242881}).success).toBe(false);
 });
 it('recovery stores only SDK-encrypted export, never login password/private key/code',()=>{
  const blob={version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:'-----BEGIN MEGOLM SESSION DATA-----\n'+Buffer.alloc(100).toString('base64')+'\n-----END MEGOLM SESSION DATA-----',expectedVersion:0};
  expect(crypto.PutRecoveryBackupSchema.safeParse(blob).success).toBe(true);
  for(const key of ['recoveryCode','password','privateKey'])expect(crypto.PutRecoveryBackupSchema.safeParse({...blob,[key]:'secret'}).success).toBe(false);
  expect(crypto.PutRecoveryBackupSchema.safeParse({...blob,ciphertext:'plaintext keys'}).success).toBe(false);
 });
 it('device registration is a public signed key bundle, not an admin trust claim',()=>{
  const user='@alice:fg.invalid',device={deviceId:'DEVICE_A',deviceKeys:{user_id:user,device_id:'DEVICE_A',algorithms:['m.olm.v1.curve25519-aes-sha2','m.megolm.v1.aes-sha2'],keys:{'curve25519:DEVICE_A':b64(32),'ed25519:DEVICE_A':b64(32)},signatures:{[user]:{'ed25519:DEVICE_A':b64(64)}}},oneTimeKeys:{'signed_curve25519:key1':{key:b64(32),signatures:{[user]:{'ed25519:DEVICE_A':b64(64)}}}}};
  expect(crypto.RegisterCryptoDeviceSchema.safeParse(device).success).toBe(true);
  expect(crypto.RegisterCryptoDeviceSchema.safeParse({...device,verified:true}).success).toBe(false);
  expect(crypto.RegisterCryptoDeviceSchema.safeParse({...device,deviceId:'OTHER'}).success).toBe(false);
  expect(crypto.RegisterCryptoDeviceSchema.safeParse({...device,deviceKeys:{...device.deviceKeys,private_key:'secret'}}).success).toBe(false);
 });
 it('migration cannot claim completion without expected original digest and exact message ID',()=>{
  const migrate={messageId:'original-id',originalSha256:b64(32),deviceId:'DEVICE_A',membershipRevision:2,envelope:request.envelope,cohortId:'verified-history-cohort'};
  expect(crypto.CommitLegacyCiphertextSchema.safeParse(migrate).success).toBe(true);
  expect(crypto.CommitLegacyCiphertextSchema.safeParse({...migrate,originalSha256:''}).success).toBe(false);
  expect(crypto.CommitLegacyCiphertextSchema.safeParse({...migrate,deleteOriginal:true}).success).toBe(false);
 });
 it('report requires explicit consent and labels selected evidence as user disclosure',()=>{
  const report={consent:true,conversationId:'room',reason:'SPAM',selectedMessages:[{messageId:'msg',text:'User selected this only',source:'USER_DISCLOSED'}]};
  expect(crypto.DiscloseChatReportSchema.safeParse(report).success).toBe(true);
  expect(crypto.DiscloseChatReportSchema.safeParse({...report,consent:false}).success).toBe(false);
  expect(crypto.DiscloseChatReportSchema.safeParse({...report,groupKey:'secret'}).success).toBe(false);
  expect(crypto.DiscloseChatReportSchema.safeParse({...report,selectedMessages:[{...report.selectedMessages[0],source:'SERVER_VERIFIED'}]}).success).toBe(false);
 });
});
