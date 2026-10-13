import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

/** Isolated real TLS Transit service; no frozen BE helper execution or main configuration. */
export async function setupReportCustody() {
  const run=randomUUID().replaceAll('-',''),name=`fg-chatcrypto-fe-report-${run}`;
  const parent=path.resolve('.runtime/chatcrypto-fe'),runtime=path.join(parent,`report-${run}`);
  const image=JSON.parse(fs.readFileSync('infra/chat-crypto/openbao-image.json','utf8')).image;
  assert.match(image,/^ghcr\.io\/openbao\/openbao@sha256:[a-f0-9]{64}$/);
  assert.match(name,/^fg-chatcrypto-fe-report-[a-f0-9]{32}$/);
  fs.mkdirSync(path.join(runtime,'data'),{recursive:true});
  const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  let started=false;
  async function close() {
    if(started){
      const info=JSON.parse(docker('inspect',name))[0];
      assert.equal(info.Name,'/'+name);assert.equal(info.Config.Labels['fg.task'],'CHATCRYPTO-FE');
      docker('rm','--force',name);started=false;
    }
    if(fs.existsSync(runtime)){assert.equal(fs.realpathSync(runtime),path.join(fs.realpathSync(parent),`report-${run}`));fs.rmSync(runtime,{recursive:true});}
  }
  try {
    const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
    execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:3072','-nodes','-days','2','-keyout',path.join(runtime,'server.key'),'-out',path.join(runtime,'server.crt'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const ca=fs.readFileSync(path.join(runtime,'server.crt'));
    fs.copyFileSync('infra/chat-crypto/openbao.hcl',path.join(runtime,'server.hcl'));
    const request=(route,body,token)=>new Promise((resolve,reject)=>{
      const payload=body===undefined?undefined:JSON.stringify(body);
      const req=https.request({agent:false,hostname:'127.0.0.1',port,path:'/v1/'+route,method:payload?'POST':'GET',ca,rejectUnauthorized:true,headers:{...(token?{'X-Vault-Token':token}:{}),...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
        let text='';res.on('data',bytes=>{text+=bytes;if(text.length>1024*1024)req.destroy();});res.on('end',()=>{try{resolve({status:res.statusCode,body:text?JSON.parse(text):{}});}catch{reject(new Error('Invalid isolated custody response; details redacted'));}});res.on('error',()=>reject(new Error('Isolated custody response interrupted')));
      });
      const deadline=setTimeout(()=>req.destroy(),10000);req.on('close',()=>clearTimeout(deadline));req.on('error',error=>reject(new Error(`Isolated custody TLS/transport failed on ${route}; code=${error.code ?? 'unknown'}; details redacted`)));if(payload)req.write(payload);req.end();
    });
    const api=async(route,body,token,status=200)=>{const result=await request(route,body,token);assert.equal(result.status,status,`Custody status mismatch ${route}; response redacted`);return result.body;};
    docker('run','--detach','--name',name,'--label','fg.task=CHATCRYPTO-FE','--user','0:0','--publish',`127.0.0.1:${port}:8200`,'--mount',`type=bind,src=${runtime},dst=/fg`,image,'server','-config=/fg/server.hcl');started=true;
    let ready=false;for(let i=0;i<40;i++){try{if((await request('sys/health')).status===501){ready=true;break;}}catch{/* finite local service readiness */}await new Promise(r=>setTimeout(r,500));}assert(ready,'Isolated custody readiness failed');
    const init=await api('sys/init',{secret_shares:1,secret_threshold:1}),root=init.root_token;
    assert(root&&init.keys[0],'Isolated initialization failed; details redacted');
    await api('sys/unseal',{key:init.keys[0]});
    let leader=false;for(let i=0;i<40;i++){try{if((await request('sys/health')).status===200){leader=true;break;}}catch{/* transient TLS restart during leader election */}await new Promise(r=>setTimeout(r,500));}assert(leader,'Isolated custody leader did not become ready');
    await api('sys/mounts/transit',{type:'transit'},root,204);
    const key=await api('transit/keys/fg-report',{type:'aes256-gcm96',exportable:false,allow_plaintext_backup:false},root);
    assert.equal(key.data.exportable,false);assert.equal(key.data.allow_plaintext_backup,false);
    assert((await api('sys/audit',undefined,root)).data['setup/'],'Actual audit device required');
    const files={};
    for(const [role,operation] of [['writer','encrypt'],['reader','decrypt']]){
      const policy=`fg-report-${role}`;
      await api('sys/policies/acl/'+policy,{policy:`path "transit/${operation}/fg-report" { capabilities = ["update"] }\npath "auth/token/lookup-self" { capabilities = ["read"] }`},root,204);
      const token=(await api('auth/token/create',{policies:[policy],ttl:'10m',no_default_policy:true},root)).auth.client_token;
      assert.equal(typeof token,'string');files[role]=path.join(runtime,role+'.token');fs.writeFileSync(files[role],token+'\n');
      const denied=operation==='encrypt'?'decrypt':'encrypt';await api(`transit/${denied}/fg-report`,denied==='decrypt'?{ciphertext:'vault:v1:invalid'}:{plaintext:Buffer.from('role-boundary-fixture').toString('base64')},token,403);
    }
    return {env:{FG_BAO_ADDRESS:`https://127.0.0.1:${port}`,FG_BAO_CA_FILE:path.join(runtime,'server.crt'),FG_BAO_REPORT_WRITER_TOKEN_FILE:files.writer,FG_BAO_REPORT_READER_TOKEN_FILE:files.reader,FG_REPORT_RETENTION_SECONDS:'3600'},
      assertAuditNoPlaintext(values){const bytes=fs.readFileSync(path.join(runtime,'audit.jsonl'));for(const value of values){assert(!bytes.includes(Buffer.from(value)));assert(!bytes.includes(Buffer.from(value).toString('base64')));}return createHash('sha256').update(bytes).digest('hex');},close};
  }catch(error){await close();throw error;}
}
