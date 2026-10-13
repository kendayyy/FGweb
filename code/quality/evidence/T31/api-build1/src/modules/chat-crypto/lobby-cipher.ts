import {Injectable,Inject,Optional,OnModuleInit,ServiceUnavailableException} from '@nestjs/common';
import {LobbyStoredMessageSchema,LobbyStorageEnvelopeSchema,MAX_IMAGE_SIZE_BYTES} from '@fg/contracts';
import {createHash} from 'node:crypto';
import {OpenBaoTransit} from './openbao-transit.js';
import {CryptoObjectStore} from './crypto-object-store.js';
export const LOBBY_CUSTODY='FG_LOBBY_CUSTODY';
@Injectable()
export class LobbyCipher implements OnModuleInit{
 readonly objects=new CryptoObjectStore(8*1024*1024);
 constructor(@Optional()@Inject(LOBBY_CUSTODY)private readonly custody?:{transit:OpenBaoTransit}){}
 async onModuleInit(){if(this.custody?.transit)await this.objects.initialize();}
 private transit(){if(!this.custody?.transit)throw new ServiceUnavailableException('Lobby custody unavailable');return this.custody.transit;}
 async encodeMessage(input:unknown){
  const parsed=LobbyStoredMessageSchema.parse(input),bytes=Buffer.from(JSON.stringify(parsed));
  try{return await this.transit().encrypt('fg-lobby',bytes,{kind:'LOBBY_MESSAGE',conversationId:parsed.conversationId,objectId:parsed.messageId});}catch{throw new ServiceUnavailableException('Lobby custody unavailable');}finally{bytes.fill(0);}
 }
 async decodeMessage(row:{id:string;conversation_id:string;crypto_envelope:unknown}){
  let bytes:Buffer;
  try{const envelope=LobbyStorageEnvelopeSchema.parse(row.crypto_envelope);if(envelope.keyId!=='fg-lobby')throw new Error();bytes=await this.transit().decrypt(envelope,{kind:'LOBBY_MESSAGE',conversationId:row.conversation_id,objectId:row.id});}catch{throw new ServiceUnavailableException('Lobby ciphertext unavailable');}
  try{const payload=LobbyStoredMessageSchema.parse(JSON.parse(bytes.toString('utf8')));if(payload.messageId!==row.id||payload.conversationId!==row.conversation_id)throw new Error();return payload;}catch{throw new ServiceUnavailableException('Lobby ciphertext integrity failed');}finally{bytes.fill(0);}
 }
 async encodeImage(bytes:Buffer,conversationId:string,id:string){
  try{return await this.transit().encrypt('fg-lobby',bytes,{kind:'LOBBY_IMAGE',conversationId,objectId:id});}catch{throw new ServiceUnavailableException('Lobby custody unavailable');}
 }
 async readImage(row:{id:string;conversation_id:string;object_key:string;envelope:unknown;ciphertext_size:number;ciphertext_sha256:string}){
  try{
   const envelope=LobbyStorageEnvelopeSchema.parse(row.envelope),bytes=await this.objects.read(row.object_key);
   if(envelope.keyId!=='fg-lobby'||bytes.length!==row.ciphertext_size||bytes.toString()!==JSON.stringify(envelope)||createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'')!==row.ciphertext_sha256)throw new Error();
   const plaintext=await this.transit().decrypt(envelope,{kind:'LOBBY_IMAGE',conversationId:row.conversation_id,objectId:row.id});
   if(!plaintext.length||plaintext.length>MAX_IMAGE_SIZE_BYTES||plaintext.toString('ascii',0,4)!=='RIFF'||plaintext.toString('ascii',8,12)!=='WEBP'){plaintext.fill(0);throw new Error();}return plaintext;
  }catch{throw new ServiceUnavailableException('Lobby image unavailable');}
 }
}
