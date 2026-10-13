import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import * as authentication from '../src/modules/chat-crypto/matrix-signatures.js';

const b64=(byte:number)=>Buffer.alloc(32,byte).toString('base64').replace(/=+$/,'');
const verify=(authentication as unknown as {verifyLegacyRoundtripAttestation:(input:unknown,device:unknown,expected:unknown)=>unknown}).verifyLegacyRoundtripAttestation;
describe('Legacy receipt authentication with native Matrix WASM',()=>{
 let machine:sdk.OlmMachine,publicKey:string,receipt:Record<string,unknown>;
 const expected={candidateId:'candidate',messageId:'original',conversationId:'private',cohortId:'verified',membershipRevision:3,originalSha256:b64(1),envelopeSha256:b64(2),attachmentDigests:[{attachmentId:'image',plaintextSha256:b64(3),ciphertextSha256:b64(4)}]};
 const device=()=>({userId:'bob',deviceId:'B',ed25519Key:publicKey});
 beforeAll(async()=>{
  await sdk.initAsync();machine=await sdk.OlmMachine.initialize(new sdk.UserId(authentication.matrixUserId('bob')),new sdk.DeviceId('B'));
  const upload=(await machine.outgoingRequests()).find(request=>request.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest;
  publicKey=JSON.parse(upload.body).device_keys.keys['ed25519:B'];
  const unsigned={version:1,type:'org.fg.legacy_roundtrip.v1',...expected,userId:'bob',deviceId:'B'};
  receipt={...unsigned,signatures:JSON.parse((await machine.sign(authentication.canonicalSignedPayload(unsigned))).asJSON())};
 });
 afterAll(()=>machine?.close());
 it('accepts a native device signature bound to the complete prepared candidate',()=>{expect(verify).toBeDefined();expect(verify(receipt,device(),expected)).toEqual(receipt);});
 it.each(['candidateId','messageId','conversationId','cohortId','originalSha256','envelopeSha256'])('rejects substituted %s even when the attacker keeps the original signature',field=>{expect(verify).toBeDefined();expect(()=>verify({...receipt,[field]:field.endsWith('Sha256')?b64(9):'other'},device(),expected)).toThrow();});
 it('rejects a signed receipt against a different server candidate or image binding',()=>{
  expect(verify).toBeDefined();for(const change of [{membershipRevision:4},{candidateId:'other'},{attachmentDigests:[]},{attachmentDigests:[{...expected.attachmentDigests[0],ciphertextSha256:b64(9)}]}])expect(()=>verify(receipt,device(),{...expected,...change})).toThrow();
 });
 it('rejects a different registered owner, device or public key',()=>{
  expect(verify).toBeDefined();for(const change of [{userId:'outsider'},{deviceId:'foreign'},{ed25519Key:b64(9)}])expect(()=>verify(receipt,{...device(),...change},expected)).toThrow();
 });
 it('rejects private fields and unsigned or altered recipient claims',()=>{
  expect(verify).toBeDefined();for(const change of [{privateKey:'forbidden'},{signatures:{}},{userId:'outsider'},{deviceId:'foreign'},{membershipRevision:4},{attachmentDigests:[{...expected.attachmentDigests[0],plaintextSha256:b64(9)}]}])expect(()=>verify({...receipt,...change},device(),expected)).toThrow();
 });
});
