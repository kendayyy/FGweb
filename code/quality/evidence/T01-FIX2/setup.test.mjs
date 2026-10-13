import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import WebSocket,{WebSocketServer} from 'ws';
const manifest=JSON.parse(fs.readFileSync('apps/api/package.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));
test('gateway dependencies are explicit and exactly locked in the API workspace',()=>{
 assert.equal(manifest.dependencies.ws,'8.21.3');assert.equal(manifest.devDependencies['@types/ws'],'8.18.2');
 assert.equal(lock.packages['apps/api'].dependencies.ws,'8.21.3');assert.equal(lock.packages['apps/api'].devDependencies['@types/ws'],'8.18.2');
 assert.equal(lock.packages['node_modules/ws'].version,'8.21.3');assert.equal(lock.packages['node_modules/@types/ws'].version,'8.18.2');
});
test('installed native ws server/client exchange binary frames and propagate closure',async()=>{
 const server=createServer(),wss=new WebSocketServer({server});let client;
 wss.on('connection',peer=>peer.on('message',bytes=>peer.send(bytes)));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  client=new WebSocket(`ws://127.0.0.1:${server.address().port}`);await once(client,'open');
  const received=once(client,'message');client.send(Buffer.from([1,2,3,255]));const [bytes,isBinary]=await received;assert.equal(isBinary,true);assert.deepEqual([...bytes],[1,2,3,255]);
  const closed=once(client,'close');client.close(1000,'setup-complete');await closed;
 }finally{client?.terminate();for(const peer of wss.clients)peer.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
});
test('adding direct gateway dependencies preserves all other package versions and integrity',()=>{
 const before=JSON.parse(fs.readFileSync('quality/evidence/T01-FIX2/before.json')).lock;
 for(const [name,entry]of Object.entries(before.packages)){
  assert(lock.packages[name],`Existing locked dependency removed: ${name}`);
  for(const key of ['version','resolved','integrity'])if(entry[key]!==undefined)assert.equal(lock.packages[name][key],entry[key],`Unrelated dependency changed: ${name}:${key}`);
 }
});
