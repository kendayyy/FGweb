// Setup-only in-memory relay for genuine SDK machines. No production adapter.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
await sdk.initAsync();
const devices=new Map(),machines=[],keys=new Map(),oneTime=new Map();
const result={sdk:'18.6.0',nativeTwoParty:false,ciphertextTamperDenied:false,crossRoomDenied:false,unverifiedNotShared:false,joinNoOldHistory:false,leaveRotatesAndRevokes:false,encryptedRecovery:false,wrongRecoveryDenied:false,newRecoveryDeviceIdentity:false,sasVerificationVerified:false,browserVerified:false,productionAdapter:false};
async function machine(user,device){const m=await sdk.OlmMachine.initialize(new sdk.UserId(user),new sdk.DeviceId(device));machines.push(m);devices.set(`${user}/${device}`,m);return m;}
async function send(m,r){
 const body=JSON.parse(r.body);let response={};
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
async function encrypt(m,text){const content=JSON.parse(await m.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:text})));return JSON.stringify({type:'m.room.encrypted',sender:m.userId.toString(),event_id:`$setup${++sequence}`,origin_server_ts:Date.now(),content});}
async function decrypt(m,event,roomId=room){return m.decryptRoomEvent(event,roomId,new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));}
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
 assert(!encrypted.includes(exported),'Recovery export not encrypted');
 assert.throws(()=>sdk.OlmMachine.decryptExportedRoomKeys(encrypted,randomBytes(32).toString('base64url')));result.wrongRecoveryDenied=true;
 const restored=await machine('@bob:fg.invalid','RESTORED');
 assert(restored.identityKeys.ed25519.toBase64()!==b.identityKeys.ed25519.toBase64(),'Recovery must not clone device identity');result.newRecoveryDeviceIdentity=true;
 await restored.importExportedRoomKeys(sdk.OlmMachine.decryptExportedRoomKeys(encrypted,recovery),()=>{});
 assert(JSON.parse((await decrypt(restored,first)).event).content.body==='FG native setup roundtrip','Recovered history failed');result.encryptedRecovery=true;
}catch(error){failure=error;}finally{
 for(const m of machines){try{m.close();}catch{result.cleanupFailure=true;}}
 fs.writeFileSync('quality/evidence/T02-FIX3/matrix-result.json',JSON.stringify({...result,recordedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify(result));
}
if(failure)throw failure;
