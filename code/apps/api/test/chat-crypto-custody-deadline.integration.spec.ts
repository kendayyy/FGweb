import {describe,it,expect} from '@jest/globals';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {Socket} from 'node:net';
import {performance} from 'node:perf_hooks';
import {CryptoCustodyConfig} from '../src/modules/chat-crypto/crypto-custody.module.js';
import {TransitFailure} from '../src/modules/chat-crypto/openbao-transit.js';

describe('custody lookup absolute deadline over actual TLS',()=>{
 it('rejects a continuously active slow response before attempting Transit',async()=>{
  const owner=path.resolve('.runtime/chatcrypto-be'),run=randomUUID(),root=path.join(owner,'custody-deadline-'+run);
  const keys=['FG_BAO_ADDRESS','FG_BAO_CA_FILE','FG_BAO_LOBBY_TOKEN_FILE'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const sockets=new Set<Socket>(),timers=new Set<ReturnType<typeof setTimeout>>();
  let server:https.Server|undefined,lookups=0,transitRequests=0,drips=0,error:unknown,elapsed:number|undefined;
  fs.mkdirSync(root,{recursive:true});
  try{
   expect(root.startsWith(owner+path.sep)).toBe(true);expect(fs.realpathSync(root)).toBe(root);
   execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',path.join(root,'server.key'),'-out',path.join(root,'server.crt'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'pipe',windowsHide:true});
   fs.writeFileSync(path.join(root,'token'),randomUUID().replaceAll('-',''));
   server=https.createServer({key:fs.readFileSync(path.join(root,'server.key')),cert:fs.readFileSync(path.join(root,'server.crt'))},(req,res)=>{
    if(req.url!=='/v1/auth/token/lookup-self'){transitRequests++;res.writeHead(403);res.end('{}');return;}
    lookups++;res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();
    // Negative transport fixture only: valid TLS, ongoing bytes, no timely policy response.
    const started=performance.now();
    const write=()=>{if(res.destroyed)return;drips++;res.write(' ');if(performance.now()-started>=6500){res.end(JSON.stringify({data:{policies:['fg-lobby-app'],ttl:60}}));return;}const timer=setTimeout(()=>{timers.delete(timer);write();},200);timers.add(timer);};write();
   });
   server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
   await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
   const address=server.address();expect(address&&typeof address!=='string').toBe(true);
   process.env.FG_BAO_ADDRESS='https://127.0.0.1:'+(address as {port:number}).port;
   process.env.FG_BAO_CA_FILE=path.join(root,'server.crt');process.env.FG_BAO_LOBBY_TOKEN_FILE=path.join(root,'token');
   const custody=await new CryptoCustodyConfig().custody('lobby');expect(custody).toBeDefined();
   const started=performance.now();try{await custody!.transit.encrypt('fg-lobby',Buffer.from('negative transport fixture'),{kind:'LOBBY_MESSAGE',conversationId:'deadline',objectId:run});}catch(caught){error=caught;}elapsed=performance.now()-started;
  }finally{
   for(const timer of timers)clearTimeout(timer);for(const socket of sockets)socket.destroy();
   if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
   for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
   expect(fs.realpathSync(root)).toBe(root);expect(root.startsWith(owner+path.sep)).toBe(true);fs.rmSync(root,{recursive:true});expect(fs.existsSync(root)).toBe(false);
  }
  expect(lookups).toBe(1);expect(drips).toBeGreaterThan(20);
  expect(error).toBeInstanceOf(TransitFailure);expect((error as TransitFailure).reason).toBe('AUTHORIZATION');
  // Transit.request intentionally maps a failed token provider to a fixed AUTHORIZATION error.
  expect(transitRequests).toBe(0);expect(elapsed).toBeGreaterThanOrEqual(4500);expect(elapsed).toBeLessThan(6000);
 },20000);
});
