import {createHash} from 'node:crypto';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import {matrixUserId,canonicalSignedPayload,verifyDeviceRegistration,verifySignedOneTimeKeys,verifyCrossSigningIdentity} from '../src/modules/chat-crypto/matrix-signatures.js';

describe('Matrix public-key authentication against real WASM output',()=>{
 let machine:sdk.OlmMachine;
 let registration:{deviceId:string;deviceKeys:unknown;oneTimeKeys:Record<string,unknown>};
 beforeAll(async()=>{
  await sdk.initAsync();
  const user=`@fg_${createHash('sha256').update('fixture-user').digest('hex')}:fg.invalid`;
  machine=await sdk.OlmMachine.initialize(new sdk.UserId(user),new sdk.DeviceId('FIXTURE'));
  const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest;
  const body=JSON.parse(upload.body);
  registration={deviceId:'FIXTURE',deviceKeys:body.device_keys,oneTimeKeys:body.one_time_keys};
 });
 afterAll(()=>machine?.close());
 it('binds FG identifiers and accepts native self-signature and signed prekeys',()=>{
  expect(matrixUserId('fixture-user')).toBe(machine.userId.toString());
  expect(()=>verifyDeviceRegistration('fixture-user',registration)).not.toThrow();
 });
 it('rejects a foreign owner even when the signature is otherwise valid',()=>{
  expect(()=>verifyDeviceRegistration('outsider',registration)).toThrow();
 });
 it('rejects altered key bytes and altered signed algorithms',()=>{
  const changed=structuredClone(registration) as typeof registration & {deviceKeys:{keys:Record<string,string>;algorithms:string[]}};
  changed.deviceKeys.keys['curve25519:FIXTURE']=Buffer.alloc(32,1).toString('base64').replace(/=+$/,'');
  expect(()=>verifyDeviceRegistration('fixture-user',changed)).toThrow();
  const changed2=structuredClone(registration) as typeof changed;
  changed2.deviceKeys.algorithms.reverse();
  expect(()=>verifyDeviceRegistration('fixture-user',changed2)).toThrow();
 });
 it('rejects a structurally valid tampered one-time key',()=>{
  const keys=structuredClone(registration.oneTimeKeys) as Record<string,{key:string}>;
  keys[Object.keys(keys)[0]].key=Buffer.alloc(32,2).toString('base64').replace(/=+$/,'');
  const publicKey=(registration.deviceKeys as {keys:Record<string,string>}).keys['ed25519:FIXTURE'];
  expect(()=>verifySignedOneTimeKeys('fixture-user','FIXTURE',publicKey,keys)).toThrow();
 });
 it('authenticates native cross-signing chains and detects altered subordinate keys',async()=>{
  const bootstrap=await machine.bootstrapCrossSigning(false);
  const body=JSON.parse(bootstrap.uploadSigningKeysRequest!.body);
  const identity={masterKey:body.master_key,selfSigningKey:body.self_signing_key,userSigningKey:body.user_signing_key};
  expect(()=>verifyCrossSigningIdentity('fixture-user',identity)).not.toThrow();
  identity.selfSigningKey.keys[Object.keys(identity.selfSigningKey.keys)[0]]=Buffer.alloc(32,3).toString('base64').replace(/=+$/,'');
  expect(()=>verifyCrossSigningIdentity('fixture-user',identity)).toThrow();
 });
 it('canonicalizes signed JSON by code point and excludes only top-level unsigned/signatures',()=>{
  const input={'\u{10000}':1,'\ue000':2,z:{signatures:'covered'},unsigned:'ignored',signatures:{ignore:true}};
  expect(canonicalSignedPayload(input)).toBe('{"z":{"signatures":"covered"},"\ue000":2,"\u{10000}":1}');
  expect(()=>canonicalSignedPayload({bad:1.5})).toThrow();
  expect(()=>canonicalSignedPayload({bad:'\ud800'})).toThrow();
 });
});
