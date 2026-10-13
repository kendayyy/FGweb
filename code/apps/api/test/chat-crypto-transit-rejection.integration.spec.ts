import {describe,it,expect,jest} from '@jest/globals';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {Socket} from 'node:net';
import {OpenBaoTransit} from '../src/modules/chat-crypto/openbao-transit.js';

describe('native TLS negative Transit decode buffer lifecycle',()=>{
 it.each(['wrong binding','wrong header','oversized body'] as const)('zeroes rejected decoded bytes for %s',async fault=>{
  const owner=path.resolve('.runtime/chatcrypto-be'),root=path.join(owner,'transit-rejection-'+randomUUID()),sockets=new Set<Socket>();
  let server:https.Server|undefined;fs.mkdirSync(root,{recursive:true});
  const binding={kind:'LOBBY_MESSAGE' as const,conversationId:'memory-fixture',objectId:'message-fixture'};
  const context=Buffer.from(JSON.stringify(['FG',1,'fg-lobby',binding.kind,fault==='wrong binding'?'foreign-fixture':binding.conversationId,binding.objectId]));
  const header=Buffer.alloc(8);header.write(fault==='wrong header'?'BAD1':'FGC1');header.writeUInt32BE(context.length,4);
  const encoded=Buffer.concat([header,context,Buffer.alloc(fault==='oversized body'?5*1024*1024+1:128,0x71)]).toString('base64');
  const original=Buffer.from,captured:Buffer[]=[];
  let observer:ReturnType<typeof jest.spyOn<typeof Buffer,'from'>>|undefined;
  try{
   expect(fs.realpathSync(root)).toBe(root);
   execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',path.join(root,'server.key'),'-out',path.join(root,'server.crt'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'pipe',windowsHide:true});
   // Fault transport only: actual trusted TLS returns deliberately invalid
   // decoded framing. This is not an OpenBao AEAD/authentication success claim.
   server=https.createServer({key:fs.readFileSync(path.join(root,'server.key')),cert:fs.readFileSync(path.join(root,'server.crt'))},(_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:{plaintext:encoded}}));});
   server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
   const address=server.address();expect(address&&typeof address!=='string').toBe(true);
   const transit=new OpenBaoTransit({address:'https://127.0.0.1:'+(address as {port:number}).port,ca:fs.readFileSync(path.join(root,'server.crt')),token:async()=>randomUUID()});
   // Call-through allocation observer: no replacement bytes or service mocks.
   observer=jest.spyOn(Buffer,'from');observer.mockImplementation(((...args:unknown[]):Buffer=>{const bytes:Buffer=Reflect.apply(original,Buffer,args);if(args[0]===encoded&&args[1]==='base64')captured.push(bytes);return bytes;}) as typeof Buffer.from);
   await expect(transit.decrypt({version:1,protocol:'OPENBAO_TRANSIT_AES256GCM',keyId:'fg-lobby',keyVersion:1,ciphertext:'vault:v1:YQ=='},binding)).rejects.toMatchObject({reason:fault==='wrong binding'?'INTEGRITY':'INVALID_ENVELOPE'});
   expect(captured).toHaveLength(1);expect(captured[0].every(byte=>byte===0)).toBe(true);
  }finally{observer?.mockRestore();for(const socket of sockets)socket.destroy();if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));expect(root.startsWith(owner+path.sep)).toBe(true);expect(fs.realpathSync(root)).toBe(root);fs.rmSync(root,{recursive:true});}
 });
});
