// Setup-only in-memory relay for genuine SDK machines. No production adapter.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import * as contracts from "../../../packages/contracts/dist/chat-crypto.js";
fs.mkdirSync("quality/evidence/CHATCRYPTO-DATA/native-interop",{recursive:true});
await sdk.initAsync();
const devices=new Map(),machines=[],keys=new Map(),oneTime=new Map(),wireFixtures={devices:[],protocol:[],olm:[],identity:null};
const result={sdk:'18.6.0',nativeTwoParty:false,ciphertextTamperDenied:false,crossRoomDenied:false,unverifiedNotShared:false,joinNoOldHistory:false,leaveRotatesAndRevokes:false,encryptedRecovery:false,wrongRecoveryDenied:false,newRecoveryDeviceIdentity:false,sasVerificationVerified:false,browserVerified:false,productionAdapter:false};
async function machine(user,device){const m=await sdk.OlmMachine.initialize(new sdk.UserId(user),new sdk.DeviceId(device));machines.push(m);devices.set(`${user}/${device}`,m);return m;}
async function send(m,r){
 const body=JSON.parse(r.body);let response={};
 if(r.type===sdk.RequestType.ToDevice)console.log(JSON.stringify({eventType:r.event_type,contentFields:Object.values(body.messages).flatMap(ds=>Object.values(ds).map(c=>Object.keys(c)))}));
 if(r.type===sdk.RequestType.KeysUpload&&body.device_keys)wireFixtures.devices.push(body.device_keys);
 if(r.type===sdk.RequestType.ToDevice)for(const ds of Object.values(body.messages))for(const content of Object.values(ds)){if(r.event_type==='m.room.encrypted')wireFixtures.olm.push(content);else wireFixtures.protocol.push({event:{eventType:r.event_type,content},senderDeviceId:m.deviceId.toString(),transactionId:content.transaction_id??r.txn_id});}
 if(r.type===sdk.RequestType.KeysUpload&&body.device_keys)contracts.RegisterCryptoDeviceSchema.parse({deviceId:m.deviceId.toString(),deviceKeys:body.device_keys,oneTimeKeys:body.one_time_keys??{}});
 if(r.type===sdk.RequestType.ToDevice)for(const [user,ds]of Object.entries(body.messages))for(const [device,content]of Object.entries(ds)){if(r.event_type==="m.room.encrypted")contracts.SendCryptoToDeviceSchema.parse({conversationId:"interop",membershipRevision:1,deviceId:m.deviceId.toString(),transactionId:"native-tx",eventType:r.event_type,recipients:[{userId:user,deviceId:device,content}]});else contracts.SendCryptoVerificationSchema.parse({conversationId:"interop",membershipRevision:1,deviceId:m.deviceId.toString(),transactionId:content.transaction_id??r.txn_id,recipientUserId:user,recipientDeviceId:device,eventType:r.event_type,content});}

 switch(r.type){
  case sdk.RequestType.KeysUpload:{
   const u=m.userId.toString(),d=m.deviceId.toString();
   if(body.device_keys){keys.set(`${u}/${d}`,body.device_keys);oneTime.set(`${u}/${d}`,new Map(Object.entries(body.one_time_keys??{})));}
   response={one_time_key_counts:{signed_curve25519:oneTime.get(`${u}/${d}`)?.size??0}};break;
  }
  case sdk.RequestType.KeysQuery:{
   response={device_keys:{},failures:{}};
   for(const u of Object.keys(body.device_keys))for(const [key,value]of keys)if(key.startsWith(`${u}/`)){response.device_keys[u]??={};response.device_keys[u][value.device_id]=value;}
   break;
  }
  case sdk.RequestType.KeysClaim:{
   response={one_time_keys:{},failures:{}};
   for(const [u,ds]of Object.entries(body.one_time_keys))for(const d of Object.keys(ds)){const store=oneTime.get(`${u}/${d}`),entry=store?.entries().next().value;if(entry){response.one_time_keys[u]??={};response.one_time_keys[u][d]={[entry[0]]:entry[1]};store.delete(entry[0]);}}
   break;
  }
  case sdk.RequestType.ToDevice:{
   for(const [u,ds]of Object.entries(body.messages))for(const [d,content]of Object.entries(ds)){const target=devices.get(`${u}/${d}`);assert(target,'Setup recipient missing');await target.receiveSyncChanges(JSON.stringify([{sender:m.userId.toString(),type:r.event_type,content}]),new sdk.DeviceLists(),new Map());}
   break;
  }
  case sdk.RequestType.SignatureUpload:break;
  default:throw new Error(`Unimplemented setup relay request type ${r.type}`);
 }
 await m.markRequestAsSent(r.id,r.type,JSON.stringify(response));
}
async function outgoing(m){for(const r of await m.outgoingRequests())await send(m,r);}
async function query(m,users){await m.updateTrackedUsers(users.map(u=>new sdk.UserId(u)));for(const r of await m.outgoingRequests())await send(m,r);}
async function trust(m,other){const d=await m.getDevice(other.userId,other.deviceId);assert(d,'Known device missing');assert(d.ed25519Key.toBase64()===other.identityKeys.ed25519.toBase64(),'Out-of-band fixture identity mismatch');await d.setLocalTrust(sdk.LocalTrust.Verified);assert(d.isVerified(),'Device trust not persisted');}
async function verifySas(a,b){
 const d=await a.getDevice(b.userId,b.deviceId);const [ar,request]=d.requestVerification([sdk.VerificationMethod.SasV1]);await send(a,request);
 const br=b.getVerificationRequest(a.userId,ar.flowId);assert(br,'Recipient verification request missing');
 await send(b,br.acceptWithMethods([sdk.VerificationMethod.SasV1]));
 const started=await ar.startSas();assert(started,'SAS did not start');const [as,initial]=started;await send(a,initial);
 const bs=br.getVerification();assert(bs instanceof sdk.Sas);await send(b,bs.accept());
 for(let i=0;i<4;i++){await outgoing(a);await outgoing(b);}
 assert(as.canBePresented()&&bs.canBePresented(),'SAS not presentable');
 assert(as.emojiIndex().join(',')===bs.emojiIndex().join(','),'Native SAS mismatch');
 for(const r of await as.confirm())await send(a,r);for(const r of await bs.confirm())await send(b,r);
 for(let i=0;i<4;i++){await outgoing(a);await outgoing(b);}
 assert(as.isDone()&&bs.isDone(),'Native SAS not completed');
 assert((await a.getDevice(b.userId,b.deviceId)).isVerified());assert((await b.getDevice(a.userId,a.deviceId)).isVerified());
 result.sasVerificationVerified=true;
}
const room=new sdk.RoomId('!setup:fg.invalid');
const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();
async function share(m,others){const ids=others.map(o=>o.userId.toString());const claim=await m.getMissingSessions(ids.map(u=>new sdk.UserId(u)));if(claim)await send(m,claim);for(const r of await m.shareRoomKey(room,ids.map(u=>new sdk.UserId(u)),settings))await send(m,r);}
let sequence=0;
async function encrypt(m,text,extra={}){const clientMessageId=`setup${++sequence}`,plain={msgtype:'m.text',body:text,fg:{version:1,conversationId:'interop',clientMessageId,senderId:m.userId.toString(),senderDeviceId:m.deviceId.toString(),membershipRevision:1,...extra}};contracts.CryptoDecryptedMessageSchema.parse(plain);const content=JSON.parse(await m.encryptRoomEvent(room,'m.room.message',JSON.stringify(plain)));contracts.PrivateMessageEnvelopeSchema.parse({version:1,protocol:'MATRIX_MEGOLM',event:content});return JSON.stringify({type:'m.room.encrypted',sender:m.userId.toString(),event_id:`$${clientMessageId}`,origin_server_ts:Date.now(),content});}
async function decrypt(m,event,roomId=room){const decoded=await m.decryptRoomEvent(event,roomId,new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));contracts.CryptoDecryptedMessageSchema.parse(JSON.parse(decoded.event).content);return decoded;}
let failure;
try{
 const a=await machine('@alice:fg.invalid','A'),b=await machine('@bob:fg.invalid','B'),c=await machine('@new:fg.invalid','C');
 for(const m of [a,b,c])await outgoing(m);
 for(const m of [a,b,c])await query(m,['@alice:fg.invalid','@bob:fg.invalid','@new:fg.invalid']);
 await share(a,[b]);const unverified=await encrypt(a,'not shared before verification');
 await assert.rejects(decrypt(b,unverified));result.unverifiedNotShared=true;
 await verifySas(a,b);await a.invalidateGroupSession(room);await share(a,[b]);
 const first=await encrypt(a,'FG native setup roundtrip');
 assert(JSON.parse((await decrypt(b,first)).event).content.body==='FG native setup roundtrip','Native roundtrip failed');result.nativeTwoParty=true;
 const changed=JSON.parse(first),cipher=Buffer.from(changed.content.ciphertext,'base64');cipher[Math.floor(cipher.length/2)]^=1;changed.content.ciphertext=cipher.toString('base64');
 await assert.rejects(decrypt(b,JSON.stringify(changed)));result.ciphertextTamperDenied=true;
 await assert.rejects(decrypt(b,first,new sdk.RoomId('!different:fg.invalid')));result.crossRoomDenied=true;
 await trust(a,c);await trust(c,a);await a.invalidateGroupSession(room);await share(a,[b,c]);
 const joined=await encrypt(a,'after join');assert(JSON.parse((await decrypt(c,joined)).event).content.body==='after join','New cohort roundtrip failed');
 await assert.rejects(decrypt(c,first));result.joinNoOldHistory=true;
 await a.invalidateGroupSession(room);await share(a,[b]);const afterLeave=await encrypt(a,'after leave');
 assert(JSON.parse((await decrypt(b,afterLeave)).event).content.body==='after leave','Retained member roundtrip failed');await assert.rejects(decrypt(c,afterLeave));result.leaveRotatesAndRevokes=true;
 const recovery=randomBytes(32).toString('base64url'),exported=await b.exportRoomKeys(()=>true);
 const encrypted=sdk.OlmMachine.encryptExportedRoomKeys(exported,recovery,500000);
 contracts.PutRecoveryBackupSchema.parse({version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:encrypted,expectedVersion:0});assert(!encrypted.includes(exported),'Recovery export not encrypted');
 assert.throws(()=>sdk.OlmMachine.decryptExportedRoomKeys(encrypted,randomBytes(32).toString('base64url')));result.wrongRecoveryDenied=true;
 const restored=await machine('@bob:fg.invalid','RESTORED');
 assert(restored.identityKeys.ed25519.toBase64()!==b.identityKeys.ed25519.toBase64(),'Recovery must not clone device identity');result.newRecoveryDeviceIdentity=true;
 await restored.importExportedRoomKeys(sdk.OlmMachine.decryptExportedRoomKeys(encrypted,recovery),()=>{});
 assert(JSON.parse((await decrypt(restored,first)).event).content.body==='FG native setup roundtrip','Recovered history failed');result.encryptedRecovery=true;
 const bootstrap=await a.bootstrapCrossSigning(false);
 const identity=JSON.parse(bootstrap.uploadSigningKeysRequest.body);
 contracts.UploadCrossSigningKeysSchema.parse({masterKey:identity.master_key,selfSigningKey:identity.self_signing_key,userSigningKey:identity.user_signing_key});
 wireFixtures.identity={masterKey:identity.master_key,selfSigningKey:identity.self_signing_key,userSigningKey:identity.user_signing_key};
 contracts.UploadCryptoSignaturesSchema.parse({signedKeys:JSON.parse(bootstrap.uploadSignaturesRequest.body)});
 result.crossSigningContracts=true;
 const stress=await encrypt(a,'\u0800'.repeat(2000),{mentionedUserIds:Array.from({length:580},(_,i)=>`${i}`.padEnd(128,'x')),reply:{messageId:'original',previewText:'\u0800'.repeat(2000)}});
 assert(JSON.parse((await decrypt(b,stress)).event).content.body==='\u0800'.repeat(2000));
 const cipherChars=JSON.parse(stress).content.ciphertext.length;assert(cipherChars>24576&&cipherChars<=contracts.MAX_CRYPTO_EVENT_BASE64_CHARS);result.richCiphertextChars=cipherChars;
}catch(error){failure=error;}finally{
 for(const m of machines){try{m.close();}catch{result.cleanupFailure=true;}}
 fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/native-interop/matrix-result.json',JSON.stringify({...result,recordedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify(result));
}
if(failure)throw failure;
fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/native-interop/wire-fixtures.json',JSON.stringify(wireFixtures,null,2)+'\n');
