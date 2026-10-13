import {createHash,createPublicKey,verify} from 'node:crypto';
import {RegisterCryptoDeviceSchema,UploadOneTimeKeysSchema,UploadCrossSigningKeysSchema,LegacyRoundtripAttestationSchema} from '@fg/contracts';
import type {z} from 'zod';

export const matrixUserId=(userId:string)=>`@fg_${createHash('sha256').update(userId,'utf8').digest('hex')}:fg.invalid`;
export const matrixRoomId=(conversationId:string)=>`!fg_${createHash('sha256').update(conversationId,'utf8').digest('hex')}:fg.invalid`;
function invalid():never{throw new Error('Invalid Matrix public-key authentication');}
export const isWellFormedUnicode=(value:string)=>Array.from(value).every(character=>{const code=character.codePointAt(0)!;return code<0xd800||code>0xdfff;});
function codePointOrder(a:string,b:string):number{
 const first=Array.from(a),second=Array.from(b);
 for(let i=0;i<Math.min(first.length,second.length);i++){const delta=first[i].codePointAt(0)!-second[i].codePointAt(0)!;if(delta)return delta;}
 return first.length-second.length;
}
function canonical(value:unknown):string{
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value))invalid();return JSON.stringify(value);}
 if(typeof value==='string'){if(!isWellFormedUnicode(value))invalid();return JSON.stringify(value);}
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(typeof value!=='object'||!value||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const data=value as Record<string,unknown>;
 return `{${Object.keys(data).sort(codePointOrder).map(k=>`${canonical(k)}:${canonical(data[k])}`).join(',')}}`;
}
/** Matrix Signing JSON: exclude unsigned/signatures at the root only. */
export function canonicalSignedPayload(value:Record<string,unknown>):string{
 return canonical(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='unsigned'&&key!=='signatures')));
}
export function matrixBase64(value:string,bytes:number):Buffer{
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value))invalid();
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==bytes||decoded.toString('base64').replace(/=+$/,'')!==value.replace(/=+$/,''))invalid();
 return decoded;
}
export function verifyMatrixSignature(value:Record<string,unknown>,userId:string,keyId:string,publicKey:string):void{
 const signatures=value.signatures as Record<string,Record<string,string>>|undefined;
 const signature=signatures?.[userId]?.[keyId];if(!signature)invalid();
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),matrixBase64(publicKey,32)]),format:'der',type:'spki'});
 if(!verify(null,Buffer.from(canonicalSignedPayload(value),'utf8'),key,matrixBase64(signature,64)))invalid();
}
type LegacyReceipt=z.infer<typeof LegacyRoundtripAttestationSchema>;
type LegacyReceiptBinding=Pick<LegacyReceipt,'candidateId'|'messageId'|'conversationId'|'cohortId'|'membershipRevision'|'originalSha256'|'envelopeSha256'|'attachmentDigests'>;
/** Authenticates the recipient claim; native decryption remains a separate acceptance proof. */
export function verifyLegacyRoundtripAttestation(input:unknown,device:{userId:string;deviceId:string;ed25519Key:string},expected:LegacyReceiptBinding):LegacyReceipt{
 const receipt=LegacyRoundtripAttestationSchema.parse(input);
 if(receipt.userId!==device.userId||receipt.deviceId!==device.deviceId)invalid();
 const binding:LegacyReceiptBinding={candidateId:receipt.candidateId,messageId:receipt.messageId,conversationId:receipt.conversationId,cohortId:receipt.cohortId,membershipRevision:receipt.membershipRevision,originalSha256:receipt.originalSha256,envelopeSha256:receipt.envelopeSha256,attachmentDigests:receipt.attachmentDigests};
 if(canonicalSignedPayload(binding)!==canonicalSignedPayload(expected))invalid();
 verifyMatrixSignature(receipt,matrixUserId(device.userId),`ed25519:${device.deviceId}`,device.ed25519Key);
 return receipt;
}
export function verifySignedOneTimeKeys(userId:string,deviceId:string,publicKey:string,input:unknown){
 const parsed=UploadOneTimeKeysSchema.parse({oneTimeKeys:input});
 for(const key of Object.values(parsed.oneTimeKeys)){
  matrixBase64(key.key,32);verifyMatrixSignature(key,matrixUserId(userId),`ed25519:${deviceId}`,publicKey);
 }
 return parsed.oneTimeKeys;
}
export function verifyDeviceRegistration(userId:string,input:unknown){
 const parsed=RegisterCryptoDeviceSchema.parse(input),device=parsed.deviceKeys;
 if(device.user_id!==matrixUserId(userId))invalid();
 const publicKey=device.keys[`ed25519:${device.device_id}`];
 matrixBase64(publicKey,32);matrixBase64(device.keys[`curve25519:${device.device_id}`],32);
 verifyMatrixSignature(device,device.user_id,`ed25519:${device.device_id}`,publicKey);
 if(Object.keys(parsed.oneTimeKeys).length)verifySignedOneTimeKeys(userId,device.device_id,publicKey,parsed.oneTimeKeys);
 return parsed;
}
export function verifyCrossSigningIdentity(userId:string,input:unknown){
 const parsed=UploadCrossSigningKeysSchema.parse(input),owner=matrixUserId(userId);
 if(parsed.masterKey.user_id!==owner)invalid();
 const [masterId,masterPublicKey]=Object.entries(parsed.masterKey.keys)[0];
 if(masterId!==`ed25519:${masterPublicKey}`)invalid();matrixBase64(masterPublicKey,32);
 for(const subordinate of [parsed.selfSigningKey,parsed.userSigningKey]){
  const [id,key]=Object.entries(subordinate.keys)[0];
  if(id!==`ed25519:${key}`)invalid();matrixBase64(key,32);
  verifyMatrixSignature(subordinate,owner,masterId,masterPublicKey);
 }
 return parsed;
}
