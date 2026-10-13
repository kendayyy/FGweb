import {Global,Module,Injectable,ServiceUnavailableException} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {OpenBaoTransit,TransitFailure} from './openbao-transit.js';
import {LOBBY_CUSTODY} from './lobby-cipher.js';
import {REPORT_CUSTODY,REPORT_READER} from './crypto-reports.service.js';
type Role='lobby'|'writer'|'reader';
const policies:Record<Role,string>={lobby:'fg-lobby-app',writer:'fg-report-writer',reader:'fg-report-reader'};
/** Token-agent sinks only; this server never provisions keys or uses root fallback. */
@Injectable()
export class CryptoCustodyConfig{
 private readonly address=process.env.FG_BAO_ADDRESS;
 private readonly caFile=process.env.FG_BAO_CA_FILE;
 private readonly files={lobby:process.env.FG_BAO_LOBBY_TOKEN_FILE,writer:process.env.FG_BAO_REPORT_WRITER_TOKEN_FILE,reader:process.env.FG_BAO_REPORT_READER_TOKEN_FILE};
 private readonly retention=process.env.FG_REPORT_RETENTION_SECONDS;
 private async readFile(input:string,maximum:number){
  let handle:fs.FileHandle|undefined,bytes:Buffer|undefined;
  try{
   if(!path.isAbsolute(input))throw new Error();const file=path.resolve(input),before=await fs.lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>maximum||await fs.realpath(file)!==file)throw new Error();
   handle=await fs.open(file,'r');const opened=await handle.stat();if(opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw new Error();
   bytes=Buffer.alloc(opened.size+1);let used=0;while(used<bytes.length){const result=await handle.read(bytes,used,bytes.length-used,used);if(!result.bytesRead)break;used+=result.bytesRead;}
   const after=await handle.stat(),current=await fs.lstat(file);if(used!==opened.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||current.dev!==opened.dev||current.ino!==opened.ino||current.size!==opened.size||current.mtimeMs!==opened.mtimeMs||await fs.realpath(file)!==file)throw new Error();return bytes.subarray(0,used);
  }catch{bytes?.fill(0);throw new TransitFailure('CONFIGURATION');}finally{await handle?.close();}
 }
 private async checkedToken(role:Role,ca:Buffer){
  const bytes=await this.readFile(this.files[role]!,16386);let token:string;try{token=bytes.toString('utf8').replace(/\r?\n$/,'');if(!/^[A-Za-z0-9._-]{8,16384}$/.test(token))throw new TransitFailure('AUTHORIZATION');}finally{bytes.fill(0);}
  await new Promise<void>((resolve,reject)=>{
   let length=0;const chunks:Buffer[]=[];const fail=(reason:'AUTHORIZATION'|'UNAVAILABLE')=>reject(new TransitFailure(reason));
   const req=https.request(new URL('/v1/auth/token/lookup-self',this.address),{method:'GET',agent:false,ca,rejectUnauthorized:true,headers:{'X-Vault-Token':token}},res=>{
    res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>65536){req.destroy();fail('UNAVAILABLE');return;}chunks.push(chunk);});res.on('error',()=>fail('UNAVAILABLE'));
    res.on('end',()=>{try{if(res.statusCode!==200)throw new Error();const result=JSON.parse(Buffer.concat(chunks).toString('utf8')).data,granted=result?.policies;if(!Array.isArray(granted)||!granted.includes(policies[role])||granted.some((policy:unknown)=>policy!==policies[role]&&policy!=='default')||typeof result.ttl!=='number'||result.ttl<=0)throw new Error();resolve();}catch{fail('AUTHORIZATION');}finally{for(const chunk of chunks)chunk.fill(0);}});
   });req.on('error',()=>fail('UNAVAILABLE'));req.setTimeout(5000,()=>req.destroy());req.end();
  });return token;
 }
 async custody(role:Role){
  if(!this.files[role])return undefined;
  try{
   if(!this.address||!this.caFile)throw new Error();const ca=await this.readFile(this.caFile,131072);if(!ca.includes(Buffer.from('-----BEGIN CERTIFICATE-----')))throw new Error();
   const transit=new OpenBaoTransit({address:this.address,ca,token:()=>this.checkedToken(role,ca)});
   if(role!=='writer')return {transit};if(!this.retention||!/^\d+$/.test(this.retention))throw new Error();const retentionSeconds=Number(this.retention);if(!Number.isSafeInteger(retentionSeconds)||retentionSeconds<1||retentionSeconds>2147483647)throw new Error();return {transit,retentionSeconds};
  }catch{throw new ServiceUnavailableException('Chat custody configuration unavailable');}
 }
}
@Global()
@Module({providers:[CryptoCustodyConfig,{provide:LOBBY_CUSTODY,inject:[CryptoCustodyConfig],useFactory:(config:CryptoCustodyConfig)=>config.custody('lobby')},{provide:REPORT_CUSTODY,inject:[CryptoCustodyConfig],useFactory:(config:CryptoCustodyConfig)=>config.custody('writer')},{provide:REPORT_READER,inject:[CryptoCustodyConfig],useFactory:(config:CryptoCustodyConfig)=>config.custody('reader')}],exports:[LOBBY_CUSTODY,REPORT_CUSTODY,REPORT_READER]})
export class CryptoCustodyModule{}
