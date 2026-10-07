import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {NestFactory} from '@nestjs/core';

const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const origin=new URL('http://localhost:18080');
assert(['localhost','127.0.0.1'].includes(origin.hostname));
assert.equal(origin.protocol,'http:');
Object.assign(process.env,env,{PUBLIC_ORIGIN:origin.origin,BETTER_AUTH_URL:origin.origin});
let app,web,phase='load-module';
const sockets=new Set();
let closing=false;
async function close(){
 if(closing)return;closing=true;
 try{
  if(web){for(const socket of sockets)socket.destroy();await new Promise(resolve=>web.httpServer.close(resolve));}
  if(app)await app.close();
  console.log(JSON.stringify({ownedLocalRuntimeStopped:true}));process.exit(0);
 }catch{console.error('Owned local runtime cleanup failed; private details omitted.');process.exit(1);}
}
process.on('SIGINT',close);process.on('SIGTERM',close);
try{
 const {AppModule}=await import('../../../apps/api/dist/app.module.js');
 phase='create-app';app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
 app.enableCors({origin:origin.origin,credentials:true});
 const apiPort=Number(env.PORT||3000);
 phase='api-listen';await app.listen(apiPort,'127.0.0.1');
 const {preview}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
 phase='web-preview';web=await preview({configFile:path.resolve('apps/web/vite.config.ts'),root:path.resolve('apps/web'),preview:{host:'127.0.0.1',port:Number(origin.port||80),strictPort:true,proxy:{'/api':`http://127.0.0.1:${apiPort}`,'/socket.io':{target:`http://127.0.0.1:${apiPort}`,ws:true}}}});
 web.httpServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 fs.writeFileSync('.runtime/auth-admin/local-server.json',JSON.stringify({pid:process.pid,origin:origin.origin,startedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({ownedLocalRuntimeReady:true,origin:origin.origin,apiPort,compiledApp:true}));
 // Activation updates only the sole server ID. Read the same local setting again
 // without exposing credentials or changing any production implementation.
 const timer=setInterval(()=>{
  const current=parseEnv(fs.readFileSync('.env.local','utf8'));
  if(current.ADMIN_USER_IDS)process.env.ADMIN_USER_IDS=current.ADMIN_USER_IDS;
  else delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_DISCORD_IDS;
 },1000);timer.unref();
}catch(error){
 const safe=value=>typeof value==='string'&&/^[A-Za-z_0-9-]{1,48}$/.test(value)?value:'omitted';
 console.error(JSON.stringify({localRuntimeFailed:true,phase,errorName:safe(error?.name),errorCode:safe(error?.code)}));
 if(web)for(const socket of sockets)socket.destroy();
 if(app)await app.close().catch(()=>{});
 process.exit(1);
}
