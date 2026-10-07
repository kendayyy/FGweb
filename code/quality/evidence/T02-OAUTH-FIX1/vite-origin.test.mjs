import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {resolveConfig}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
test('normal dev and preview use the working local OAuth origin with strict binding and actual API proxies',async()=>{
 const config=await resolveConfig({root:path.resolve('apps/web'),configFile:path.resolve('apps/web/vite.config.ts')},'serve','development');
 assert.equal(config.server.port,18080);assert.equal(config.server.strictPort,true);assert.equal(config.server.host,'127.0.0.1');
 assert.equal(config.preview.port,18080);assert.equal(config.preview.strictPort,true);
 assert.equal(config.server.proxy['/api'],'http://127.0.0.1:3000');assert.equal(config.server.proxy['/socket.io'].ws,true);
});
