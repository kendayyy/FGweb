import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import https from 'node:https';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T02-FIX3';
const image=JSON.parse(fs.readFileSync('infra/chat-crypto/openbao-image.json')).image;
assert.match(image,/^ghcr\.io\/openbao\/openbao@sha256:[a-f0-9]{64}$/);
const run=randomUUID().replaceAll('-',''),name=`fg-chatcrypto-t02-${run}`;
const runtime=path.resolve(`.runtime/chatcrypto-setup/transit-${run}`);
assert(runtime.startsWith(path.resolve('.runtime/chatcrypto-setup')+path.sep));
fs.mkdirSync(`${runtime}/data`,{recursive:true});
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const listen=net.createServer();await new Promise(r=>listen.listen(0,'127.0.0.1',r));const port=listen.address().port;await new Promise(r=>listen.close(r));
execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:3072','-nodes','-days','2','-keyout',`${runtime}/server.key`,'-out',`${runtime}/server.crt`,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:['ignore','pipe','pipe']});
const ca=fs.readFileSync(`${runtime}/server.crt`);
fs.copyFileSync('infra/chat-crypto/openbao.hcl',`${runtime}/server.hcl`);
const request=(route,body,token,trust=true)=>new Promise((resolve,reject)=>{
 const payload=body===undefined?null:JSON.stringify(body);
 const req=https.request({hostname:'127.0.0.1',port,path:`/v1/${route}`,method:payload?'POST':'GET',ca:trust?ca:undefined,rejectUnauthorized:true,headers:{...(token?{'X-Vault-Token':token}:{}),...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
  let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{resolve({status:res.statusCode,body:text?JSON.parse(text):{}});}catch{reject(new Error('Invalid service JSON (response redacted)'));}});
 });req.on('error',error=>reject(new Error(`TLS/transport rejected on ${route}; code=${error.code??'unknown'} (details redacted)`)));req.setTimeout(30000,()=>req.destroy(new Error('service timeout')));if(payload)req.write(payload);req.end();
});
const api=async(route,body,token,expected=200)=>{const r=await request(route,body,token);if(route==='sys/audit/setup'&&r.status!==expected){const safe=JSON.stringify(r.body.errors??[]).replaceAll(token,'[REDACTED]');fs.writeFileSync(`${dir}/audit-enable-diagnostic.txt`,safe+'\n');}assert.equal(r.status,expected,`Unexpected status on ${route}; response redacted`);return r.body;};
const waitLeader=async()=>{for(let i=0;i<40;i++){const r=await request('sys/health');if(r.status===200)return;if(![429,503].includes(r.status))throw new Error('Unexpected readiness state');await new Promise(r=>setTimeout(r,500));}throw new Error('OpenBao never became active leader');};
const results={run,version:'2.7.1',image,tlsVerified:false,untrustedTlsDenied:false,transitRoundtrip:false,nonceRandomized:false,tamperDenied:false,appCannotManageKeys:false,appCannotReadReports:false,keyExportDenied:false,operatorRotationRewrap:false,restartPersistence:false,sealedDenied:false,outageDenied:false,appRoleSecretRevocation:false,auditPlaintextAbsent:false,mainDatabaseChanged:false,mainEnvironmentChanged:false,productionReady:false,cleanup:false};
let started=false;
try{
 docker('run','--detach','--name',name,'--label','fg.task=T02-FIX3','--user','0:0','--publish',`127.0.0.1:${port}:8200`,'--mount',`type=bind,src=${runtime},dst=/fg`,image,'server','-config=/fg/server.hcl');started=true;
 for(let i=0;i<40;i++){try{const r=await request('sys/health');if(r.status===501)break;}catch{/* finite readiness retry */}if(i===39)throw new Error('OpenBao readiness failed; no fallback');await new Promise(r=>setTimeout(r,500));}
 await assert.rejects(request('sys/health',undefined,undefined,false));results.untrustedTlsDenied=true;
 const init=await api('sys/init',{secret_shares:1,secret_threshold:1});
 const root=init.root_token,unseal=init.keys[0];assert(root&&unseal,'Initialization failed (redacted)');
 await api('sys/unseal',{key:unseal});
 await waitLeader();await api('sys/health');results.tlsVerified=true;
 await api('sys/mounts/transit',{type:'transit'},root,204);
 for(const key of ['fg-lobby','fg-report']){const created=await api(`transit/keys/${key}`,{type:'aes256-gcm96',exportable:false,allow_plaintext_backup:false},root,200);assert.equal(created.data.type,'aes256-gcm96');assert.equal(created.data.exportable,false);}
 assert((await api('sys/audit',undefined,root)).data['setup/'],'Declarative audit device missing');
 const appPolicy='path "transit/encrypt/fg-lobby" { capabilities = ["update"] }\npath "transit/decrypt/fg-lobby" { capabilities = ["update"] }';
 const opPolicy='path "transit/keys/fg-lobby/rotate" { capabilities = ["update"] }\npath "transit/rewrap/fg-lobby" { capabilities = ["update"] }';
 await api('sys/policies/acl/fg-lobby-app',{policy:appPolicy},root,204);
 await api('sys/policies/acl/fg-lobby-operator',{policy:opPolicy},root,204);
 await api('sys/auth/approle',{type:'approle'},root,204);
 await api('auth/approle/role/fg-lobby',{token_policies:['fg-lobby-app'],token_ttl:'10m',token_max_ttl:'10m',secret_id_ttl:'10m',secret_id_num_uses:2},root,204);
 const role=(await api('auth/approle/role/fg-lobby/role-id',undefined,root)).data.role_id;
 const secret=(await api('auth/approle/role/fg-lobby/secret-id',{},root)).data;
 const app=(await api('auth/approle/login',{role_id:role,secret_id:secret.secret_id})).auth.client_token;
 const operator=(await api('auth/token/create',{policies:['fg-lobby-operator'],ttl:'10m',no_default_policy:true},root)).auth.client_token;
 const plaintext=Buffer.from(`FG setup-only payload ${run}`).toString('base64');
 const cipher=(await api('transit/encrypt/fg-lobby',{plaintext},app)).data.ciphertext;
 const cipher2=(await api('transit/encrypt/fg-lobby',{plaintext},app)).data.ciphertext;
 assert(cipher!==cipher2,'Repeated encryption must randomize nonce');results.nonceRandomized=true;
 assert((await api('transit/decrypt/fg-lobby',{ciphertext:cipher},app)).data.plaintext===plaintext,'Transit roundtrip failed (redacted)');results.transitRoundtrip=true;
 const parts=cipher.split(':');const tampered=Buffer.from(parts[2],'base64');tampered[tampered.length-1]^=1;parts[2]=tampered.toString('base64');
 await api('transit/decrypt/fg-lobby',{ciphertext:parts.join(':')},app,400);results.tamperDenied=true;
 await api('transit/keys/fg-lobby/rotate',{},app,403);await api('transit/keys/fg-lobby/config',{exportable:true},app,403);results.appCannotManageKeys=true;
 await api('transit/encrypt/fg-report',{plaintext},app,403);
 const reportCipher=(await api('transit/encrypt/fg-report',{plaintext},root)).data.ciphertext;
 await api('transit/decrypt/fg-report',{ciphertext:reportCipher},app,403);results.appCannotReadReports=true;
 await api('transit/export/encryption-key/fg-lobby',undefined,root,400);results.keyExportDenied=true;
 await api('transit/decrypt/fg-lobby',{ciphertext:cipher},operator,403);
 const rotated=await api('transit/keys/fg-lobby/rotate',{},operator,200);assert.equal(rotated.data.latest_version,2);
 const rewrapped=(await api('transit/rewrap/fg-lobby',{ciphertext:cipher},operator)).data.ciphertext;
 assert.match(rewrapped,/^bao:v2:|^vault:v2:/);
 assert((await api('transit/decrypt/fg-lobby',{ciphertext:rewrapped},app)).data.plaintext===plaintext,'Rewrap changed plaintext (redacted)');results.operatorRotationRewrap=true;
 await api('auth/approle/role/fg-lobby/secret-id-accessor/destroy',{secret_id_accessor:secret.secret_id_accessor},root,204);
 await api('auth/approle/login',{role_id:role,secret_id:secret.secret_id},undefined,400);results.appRoleSecretRevocation=true;
 await api('sys/seal',{},root,204);
 await api('transit/decrypt/fg-lobby',{ciphertext:cipher},app,503);results.sealedDenied=true;
 docker('restart',name);
 for(let i=0;i<40;i++){try{const r=await request('sys/health');if(r.status===503)break;}catch{/* finite restart retry */}if(i===39)throw new Error('OpenBao restart readiness failed');await new Promise(r=>setTimeout(r,500));}
 await api('sys/unseal',{key:unseal});
 await waitLeader();
 assert((await api('transit/decrypt/fg-lobby',{ciphertext:cipher},app)).data.plaintext===plaintext,'Persistent roundtrip failed (redacted)');results.restartPersistence=true;
 const log=fs.readFileSync(`${runtime}/audit.jsonl`,'utf8');
 for(const value of [plaintext,Buffer.from(plaintext,'base64').toString(),root,app,operator,secret.secret_id,unseal])assert(!log.includes(value),'Sensitive plaintext appeared in service audit (redacted)');results.auditPlaintextAbsent=true;
 docker('stop',name);await assert.rejects(request('transit/decrypt/fg-lobby',{ciphertext:cipher},app));results.outageDenied=true;
}finally{
 if(started){const labels=JSON.parse(docker('inspect','--format','{{json .Config.Labels}}',name));assert.equal(labels['fg.task'],'T02-FIX3');docker('rm','--force',name);}
 // Keep public service configuration/result only. Delete the exact owned fixture,
 // including test TLS private key and test key-store, after path verification.
 assert(runtime.startsWith(path.resolve('.runtime/chatcrypto-setup')+path.sep));fs.rmSync(runtime,{recursive:true,force:true});results.cleanup=true;
 fs.writeFileSync(`${dir}/transit-result.json`,JSON.stringify({...results,recordedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify(results));
}
