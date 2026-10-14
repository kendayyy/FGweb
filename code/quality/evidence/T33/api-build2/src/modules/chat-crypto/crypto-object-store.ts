import fs from 'node:fs/promises';
import path from 'node:path';
import {constants,type Dir} from 'node:fs';
import type {PoolClient} from 'pg';

/** Every production object writer holds this transaction lock before creating bytes. */
export async function lockCryptoObjectWrite(db:PoolClient,key:string){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(key))throw new Error('Invalid crypto object key');
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_object',current_schema(),$1::text)::text,0::bigint))",[key]);
}

/** Opaque ciphertext objects only; no public/static route or client filenames. */
export class CryptoObjectStore {
 private directory!:string;
 private scan?:Dir;
 constructor(private readonly maximumBytes=5*1024*1024){if(![5*1024*1024,8*1024*1024].includes(maximumBytes))throw new Error('Invalid crypto object budget');}
 async initialize(){
  const cwd=process.cwd(),codeRoot=path.basename(cwd)==='api'&&path.basename(path.dirname(cwd))==='apps'?path.resolve(cwd,'../..'):cwd;
  const runtime=path.join(codeRoot,'.runtime'),requested=path.resolve(process.env.FG_CRYPTO_OBJECTS_DIR??path.join(runtime,'chat-crypto-objects'));
  if(!requested.startsWith(runtime+path.sep))throw new Error('Crypto objects must remain in code/.runtime');
  const code=await fs.realpath(codeRoot);
  await fs.mkdir(runtime,{recursive:true});const root=await fs.realpath(runtime);
  if(root!==path.join(code,'.runtime'))throw new Error('Crypto runtime cannot be redirected');
  // Validate the nearest existing ancestor before mkdir follows a junction.
  let ancestor=requested,resolvedAncestor:string;
  for(;;){try{resolvedAncestor=await fs.realpath(ancestor);break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;ancestor=path.dirname(ancestor);}}
  if(resolvedAncestor!==root&&!resolvedAncestor.startsWith(root+path.sep))throw new Error('Crypto object storage cannot escape through a link');
  await fs.mkdir(requested,{recursive:true});
  const resolved=await fs.realpath(requested);
  if(!resolved.startsWith(root+path.sep))throw new Error('Crypto object storage cannot escape through a link');
  this.directory=resolved;
 }
 private async location(key:string){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(key))throw new Error('Invalid crypto object key');
  if(await fs.realpath(this.directory)!==this.directory)throw new Error('Crypto object directory changed');
  return path.join(this.directory,key);
 }
 async put(key:string,bytes:Buffer){if(!bytes.length||bytes.length>this.maximumBytes)throw new Error('Invalid crypto object size');await fs.writeFile(await this.location(key),bytes,{flag:'wx',mode:0o600});}
 async read(key:string){
  const target=await this.location(key),stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>this.maximumBytes||await fs.realpath(target)!==target)throw new Error('Invalid crypto object');
  const handle=await fs.open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes:Buffer|undefined;
  try{
   const opened=await handle.stat();if(!opened.isFile()||opened.size<1||opened.size>this.maximumBytes||opened.size!==stat.size||opened.dev!==stat.dev||opened.ino!==stat.ino)throw new Error('Invalid crypto object');
   // One extra byte detects growth without permitting an unbounded readFile allocation.
   bytes=Buffer.alloc(opened.size+1);let length=0;
   while(length<bytes.length){const read=await handle.read(bytes,length,bytes.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead;}
   const current=await handle.stat(),named=await fs.lstat(target);
   if(length!==opened.size||current.size!==opened.size||current.dev!==opened.dev||current.ino!==opened.ino||!named.isFile()||named.isSymbolicLink()||named.size!==opened.size||named.dev!==opened.dev||named.ino!==opened.ino||await fs.realpath(target)!==target)throw new Error('Invalid crypto object');
   return bytes.subarray(0,length);
  }catch(error){bytes?.fill(0);throw error;}finally{await handle.close();}
 }
 async remove(key:string){
  const target=await this.location(key);
  try{await fs.unlink(target);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 /** Advance a bounded directory cursor; never enumerate into one unbounded array. */
 async scanCandidates(){
  if(await fs.realpath(this.directory)!==this.directory)throw new Error('Crypto object directory changed');
  if(!this.scan)this.scan=await fs.opendir(this.directory,{bufferSize:32});
  const candidates:string[]=[];
  try{for(let index=0;index<100;index++){const entry=await this.scan.read();if(!entry){await this.closeScan();break;}if(entry.isFile()&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/.test(entry.name))candidates.push(entry.name);}return candidates;}
  catch(error){await this.closeScan();throw error;}
 }
 async closeScan(){const scan=this.scan;this.scan=undefined;await scan?.close();}
}
