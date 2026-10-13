import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const budget=4*1024*1024,scope=/^crypto_fe_[a-f0-9]{32}$/;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const dir='quality/evidence/CHATCRYPTO-FE';
function location(schema){assert.match(schema,scope);const parent=fs.realpathSync('.runtime/chatcrypto-fe');return path.join(parent,schema);}
function cli(operation,schema,input){
  assert.match(schema,scope);
  const script=operation==='dump'?'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema="$1" --no-owner --no-privileges':'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose';
  const argv=['exec',...(input?['-i']:[]),'fg-local-postgres-1','sh','-c',script,'fg-fe-source-archive',schema];
  const startedAt=new Date().toISOString();let output,status=0;
  try{output=execFileSync('docker',argv,{input,windowsHide:true,maxBuffer:budget,stdio:['pipe','pipe','pipe']});return output;}
  catch(error){status=1;const stderr=Buffer.from(error.stderr??'');const sha=digest(stderr);for(const value of [error.stdout,error.stderr,...(error.output??[])])if(Buffer.isBuffer(value))value.fill(0);stderr.fill(0);throw new Error('Owned archive PostgreSQL operation failed; redacted diagnostic SHA256='+sha);}
  finally{fs.appendFileSync(dir+'/legacy-source-archive-commands.jsonl',JSON.stringify({operation,schema,argv,startedAt,completedAt:new Date().toISOString(),exitCode:status,inputSha256:input?digest(input):null,outputSha256:output?digest(output):null})+'\n');}
}
function transit(env,operation,body){
  const address=new URL(env.FG_BAO_ADDRESS);assert.equal(address.protocol,'https:');assert.equal(address.hostname,'127.0.0.1');
  const ca=fs.readFileSync(env.FG_BAO_CA_FILE),token=fs.readFileSync(env[operation==='encrypt'?'FG_BAO_ARCHIVE_WRITER_TOKEN_FILE':'FG_BAO_ARCHIVE_READER_TOKEN_FILE'],'utf8').trim(),bytes=Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    const request=https.request({agent:false,hostname:address.hostname,port:address.port,path:'/v1/transit/'+operation+'/fg-source-archive',method:'POST',ca,rejectUnauthorized:true,headers:{'X-Vault-Token':token,'Content-Type':'application/json','Content-Length':bytes.length}},response=>{
      const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>budget*3){response.destroy(new Error('Archive custody response exceeds bound'));return;}chunks.push(chunk);});
      response.on('error',()=>{for(const chunk of chunks)chunk.fill(0);reject(new Error('Archive custody response failed'));});
      response.on('end',()=>{const result=Buffer.concat(chunks);for(const chunk of chunks)chunk.fill(0);try{assert.equal(response.statusCode,200,'Archive custody denied');resolve(JSON.parse(result.toString()).data);}catch{reject(new Error('Archive custody response invalid or denied'));}finally{result.fill(0);}});
    });
    request.setTimeout(10000,()=>request.destroy(new Error('Archive custody timeout')));request.on('error',()=>reject(new Error('Archive custody TLS request failed')));request.end(bytes,()=>bytes.fill(0));
  });
}
function objectKey(key){assert.match(key,/^(legacy|opaque)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(webp|bin)$/);assert.equal(key.startsWith('legacy/'),key.endsWith('.webp'));}
export async function createLegacySourceArchive(schema,env){
  const root=location(schema);assert.equal(fs.realpathSync(root),root);
  const dump=cli('dump',schema),objects=[];let plaintext;
  try{
    for(const bucket of ['legacy','opaque']){const folder=path.join(root,bucket);if(!fs.existsSync(folder))continue;assert.equal(fs.realpathSync(folder),folder);for(const name of fs.readdirSync(folder)){const key=bucket+'/'+name;objectKey(key);const file=path.join(folder,name),stat=fs.lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink());const bytes=fs.readFileSync(file);try{assert(bytes.length>0&&bytes.length<=budget);objects.push({key,size:bytes.length,sha256:digest(bytes),bytes:bytes.toString('base64')});}finally{bytes.fill(0);}}}
    const backupId=randomUUID();plaintext=Buffer.from(JSON.stringify({version:1,backupId,schema,dump:dump.toString('base64'),dumpSha256:digest(dump),objects}));assert(plaintext.length<=budget);
    const result=await transit(env,'encrypt',{plaintext:plaintext.toString('base64')});assert.match(result.ciphertext,/^vault:v1:/);
    const archive={version:1,backupId,ciphertext:result.ciphertext},bytes=Buffer.from(JSON.stringify(archive));
    fs.writeFileSync(path.join(root,'encrypted-source-archive.json'),bytes,{flag:'wx',mode:0o600});
    const proof={backupId,schema,archiveSha256:digest(bytes),dumpSha256:digest(dump),objects:objects.map(({key,size,sha256})=>({key,size,sha256})),clientKeysIncluded:false,custodyKeysIncluded:false};
    fs.writeFileSync(dir+'/legacy-source-archive-'+backupId+'.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return {archive,proof};
  }finally{dump.fill(0);plaintext?.fill(0);}
}
export async function restoreLegacySourceArchive(archive,target,env,pool){
  const root=location(target);assert(!fs.existsSync(root));assert.equal((await pool.query('SELECT to_regnamespace($1) AS value',[target])).rows[0].value,null);
  assert.equal(archive.version,1);assert(archive.ciphertext.length<budget*3);
  const result=await transit(env,'decrypt',{ciphertext:archive.ciphertext}),plaintext=Buffer.from(result.plaintext,'base64');let dump,rebased;
  try{
    assert(plaintext.length<=budget);const payload=JSON.parse(plaintext.toString());assert.equal(payload.version,1);assert.equal(payload.backupId,archive.backupId);assert.match(payload.schema,scope);assert.notEqual(payload.schema,target);
    dump=Buffer.from(payload.dump,'base64');assert.equal(digest(dump),payload.dumpSha256);const keys=new Set();
    for(const object of payload.objects){objectKey(object.key);assert(!keys.has(object.key));keys.add(object.key);const bytes=Buffer.from(object.bytes,'base64');try{assert.equal(bytes.length,object.size);assert.equal(digest(bytes),object.sha256);}finally{bytes.fill(0);}}
    // Rebase SQL namespace references, preserving every COPY data line byte for byte.
    let copying=false;const sql=dump.toString().split('\n').map(line=>{if(copying){if(line==='\\.')copying=false;return line;}const output=line.replaceAll(payload.schema,target);if(/^COPY .* FROM stdin;$/.test(line))copying=true;return output;}).join('\n');assert.equal(copying,false);
    const empty="SELECT pg_catalog.set_config('search_path', '', false);";assert.equal(sql.split(empty).length,2);
    rebased=Buffer.from(sql.replace(empty,"SELECT pg_catalog.set_config('search_path', '"+target+", public', false);"));cli('restore',target,rebased);
    fs.mkdirSync(root);assert.equal(fs.realpathSync(root),root);
    for(const object of payload.objects){const bytes=Buffer.from(object.bytes,'base64');try{const folder=path.join(root,object.key.split('/')[0]);fs.mkdirSync(folder,{recursive:true});assert.equal(fs.realpathSync(folder),folder);fs.writeFileSync(path.join(root,object.key),bytes,{flag:'wx',mode:0o600});}finally{bytes.fill(0);}}
    return payload.objects.map(({key,size,sha256})=>({key,size,sha256}));
  }finally{plaintext.fill(0);dump?.fill(0);rebased?.fill(0);}
}
