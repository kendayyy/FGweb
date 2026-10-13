/** Native acceptance helper: isolated UUID fixtures only, never production/public schemas. */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
type Archive={version:1;ciphertext:string};
type ObjectRow={key:string;sha256:string;size:number;bytes:string};
type Payload={version:1;backupId:string;schema:string;dump:string;dumpSha256:string;objects:ObjectRow[]};
const budget=4*1024*1024,sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const namespace=(value:string)=>assert.match(value,/^crypto_be_[a-f0-9]{32}$/);
const uuid=(value:string)=>assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const objectKey=(value:string)=>assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/);
function root(schema:string,directory:string,existing:boolean){
 namespace(schema);const base=fs.realpathSync('.runtime/chatcrypto-be'),expected=path.join(base,schema,'encrypted');assert.equal(path.resolve(directory),expected);
 if(existing){assert.equal(fs.realpathSync(directory),expected);assert(fs.lstatSync(directory).isDirectory());assert(!fs.lstatSync(directory).isSymbolicLink());}
 else{assert(!fs.existsSync(path.join(base,schema)));}
 return expected;
}
function cli(command:'dump'|'restore'|'probe',schema:string,input?:Buffer){
 namespace(schema);const script=command==='dump'?'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema="$1" --no-owner --no-privileges':command==='restore'?'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose':'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At --set=ON_ERROR_STOP=1 -c "SELECT to_regnamespace(\'$1\') IS NULL"';
 const argv=['exec',...(input?['-i']:[]),'fg-local-postgres-1','sh','-c',script,'--',schema],startedAt=new Date().toISOString();let output:Buffer|undefined,status=0;
 try{output=execFileSync('docker',argv,{input,stdio:['pipe','pipe','pipe'],maxBuffer:budget,timeout:30000});}
 catch(error){status=1;const stderr=String((error as {stderr?:Buffer}).stderr??''),sqlState=stderr.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5}):/)?.[1]??'unknown',line=stderr.match(/psql:<stdin>:(\d+):/)?.[1]??'unknown';fs.appendFileSync('quality/evidence/CHATCRYPTO-BE/backup-native-diagnostics.jsonl',JSON.stringify({command,sqlState,line,stderrSha256:sha(stderr),categories:['permission denied','does not exist','already exists','syntax error','duplicate key','violates check constraint','cannot drop','unrecognized configuration parameter'].filter(term=>stderr.includes(term))})+'\n');if(error instanceof Error){const captured=error as Error&{stdout?:Buffer;stderr?:Buffer;output?:unknown[]};for(const buffer of [captured.stdout,captured.stderr,...(captured.output??[])])if(Buffer.isBuffer(buffer))buffer.fill(0);for(const property of ['stdout','stderr','output','cmd'])Reflect.deleteProperty(error,property);error.message='Native backup PostgreSQL command failed; SQLSTATE='+sqlState+'; diagnostic SHA256='+sha(stderr)+' (output redacted)';Error.captureStackTrace(error,cli);}throw error;}
 finally{fs.appendFileSync('quality/evidence/CHATCRYPTO-BE/backup-native-commands.jsonl',JSON.stringify({command,argv,schema,startedAt,completedAt:new Date().toISOString(),exitCode:status,inputSha256:input?sha(input):null,outputSha256:output?sha(output):null})+'\n');}
 return output!;
}
async function transit(operation:'encrypt'|'decrypt'|'rewrap'|'rotate',body:unknown,operator=false){
 const address=new URL(process.env.FG_REPORT_TEST_ADDRESS!),ca=fs.readFileSync(process.env.FG_REPORT_TEST_CA!),tokenFile=process.env[operator?'FG_BACKUP_TEST_OPERATOR_FILE':'FG_BACKUP_TEST_AGENT_FILE'];assert(tokenFile);
 assert.equal(address.protocol,'https:');assert.equal(address.hostname,'127.0.0.1');const token=fs.readFileSync(tokenFile,'utf8').trim();assert(/^[A-Za-z0-9._-]{8,16384}$/.test(token));
 const bytes=Buffer.from(JSON.stringify(body));assert(bytes.length<8*1024*1024);
 return await new Promise<{ciphertext?:string;plaintext?:string}>((resolve,reject)=>{
 const req=https.request({agent:false,hostname:address.hostname,port:address.port,path:'/v1/transit/'+(operation==='rotate'?'keys/fg-backup/rotate':operation+'/fg-backup'),method:'POST',ca,rejectUnauthorized:true,headers:{'X-Vault-Token':token,'Content-Type':'application/json','Content-Length':bytes.length}},res=>{
 const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8*1024*1024){req.destroy();return;}chunks.push(chunk);});res.on('end',()=>{try{if(res.statusCode!==200)throw new Error();const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));resolve(parsed.data??{});}catch{reject(new Error('Backup custody rejected (response redacted)'));}finally{for(const chunk of chunks)chunk.fill(0);}});
 });req.on('error',()=>reject(new Error('Backup custody unavailable (transport redacted)')));req.setTimeout(5000,()=>req.destroy());req.end(bytes);
 });
}
export async function createOwnedBackup(schema:string,directory:string,backupId:string):Promise<Archive>{
 namespace(schema);uuid(backupId);const location=root(schema,directory,true),dump=cli('dump',schema);const objects:ObjectRow[]=[];
 try{
 assert(dump.length>0&&dump.toString('utf8').includes('CREATE SCHEMA '+schema));
 for(const key of fs.readdirSync(location).sort()){
 objectKey(key);const file=path.join(location,key),before=fs.lstatSync(file);assert(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=budget);assert.equal(fs.realpathSync(file),file);
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file);assert.equal(before.ino,after.ino);assert.equal(before.size,after.size);assert.equal(before.mtimeMs,after.mtimeMs);
 objects.push({key,size:bytes.length,sha256:sha(bytes),bytes:bytes.toString('base64')});bytes.fill(0);
 }
 const payload:Payload={version:1,backupId,schema,dump:dump.toString('base64'),dumpSha256:sha(dump),objects},plaintext=Buffer.from(JSON.stringify(payload));
 try{assert(plaintext.length<=budget);const result=await transit('encrypt',{plaintext:plaintext.toString('base64')});assert(result.ciphertext);const archive:Archive={version:1,ciphertext:result.ciphertext},archiveBytes=Buffer.from(JSON.stringify(archive)),archiveDirectory=path.join(path.dirname(location),'backup-archives');fs.mkdirSync(archiveDirectory,{recursive:true});assert.equal(fs.realpathSync(archiveDirectory),archiveDirectory);const archiveFile=path.join(archiveDirectory,backupId+'.json');fs.writeFileSync(archiveFile,archiveBytes,{flag:'wx',mode:0o600});fs.appendFileSync('quality/evidence/CHATCRYPTO-BE/backup-native-artifacts.jsonl',JSON.stringify({recordedAt:new Date().toISOString(),backupId,schema,encryptedArchiveSha256:sha(archiveBytes),encryptedArchiveSize:archiveBytes.length,dumpSha256:payload.dumpSha256,objects:objects.map(({key,sha256,size})=>({key,sha256,size})),clientKeysIncluded:false,custodyKeysIncluded:false})+'\n');return JSON.parse(fs.readFileSync(archiveFile,'utf8')) as Archive;}finally{plaintext.fill(0);}
 }finally{dump.fill(0);}
}
export async function rotateOwnedBackup(archive:Archive):Promise<Archive>{
 assert.equal(archive.version,1);await transit('rotate',{},true);const result=await transit('rewrap',{ciphertext:archive.ciphertext},true);assert(result.ciphertext);return {version:1,ciphertext:result.ciphertext};
}
export async function restoreOwnedBackup(archive:Archive,backupId:string,target:string,directory:string){
 uuid(backupId);namespace(target);const location=root(target,directory,false);assert.equal(archive.version,1);assert(archive.ciphertext.length<8*1024*1024);
 const result=await transit('decrypt',{ciphertext:archive.ciphertext});assert(result.plaintext);const bytes=Buffer.from(result.plaintext,'base64');assert(bytes.length<=budget);
 let dump:Buffer|undefined;
 try{
 const payload=JSON.parse(bytes.toString('utf8')) as Payload;assert.equal(payload.version,1);assert.equal(payload.backupId,backupId);namespace(payload.schema);assert.notEqual(payload.schema,target);assert(Array.isArray(payload.objects));
 dump=Buffer.from(payload.dump,'base64');assert.equal(sha(dump),payload.dumpSha256);const keys=new Set<string>();
 for(const object of payload.objects){objectKey(object.key);assert(!keys.has(object.key));keys.add(object.key);const content=Buffer.from(object.bytes,'base64');try{assert.equal(content.length,object.size);assert.equal(sha(content),object.sha256);assert(content.length>0&&content.length<=budget);}finally{content.fill(0);}}
 assert.equal(cli('probe',target).toString().trim(),'t');
 // Controlled fixture-only namespace: UUID schema text cannot occur in base64 ciphertext.
 const sql=dump.toString('utf8').replaceAll(payload.schema,target),emptyPath="SELECT pg_catalog.set_config('search_path', '', false);";assert.equal(sql.split(emptyPath).length,2);const rebased=Buffer.from(sql.replace(emptyPath,"SELECT pg_catalog.set_config('search_path', '"+target+", public', false);"));try{cli('restore',target,rebased);}finally{rebased.fill(0);}
 fs.mkdirSync(location,{recursive:true});assert.equal(fs.realpathSync(location),location);
 for(const object of payload.objects){const content=Buffer.from(object.bytes,'base64');try{fs.writeFileSync(path.join(location,object.key),content,{flag:'wx',mode:0o600});}finally{content.fill(0);}}
 }finally{dump?.fill(0);bytes.fill(0);}
}
