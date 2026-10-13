import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const image='livekit/livekit-server:v1.9.12@sha256:2c13cbf2edcbf13ea7b20d05c10b394d04d8fb3fe358269cff845a90b4de9576';
test('approved SFU version is locked in local compose and dedicated media manifest',()=>{
 assert(fs.readFileSync('infra/compose.local.yml','utf8').includes(`image: ${image}`));
 const manifest=JSON.parse(fs.readFileSync('infra/media/livekit-image.json','utf8'));assert.equal(manifest.image,image);assert.equal(manifest.clientSdk,'2.22.3');
 assert.equal(JSON.parse(fs.readFileSync('apps/web/package.json')).dependencies['livekit-client'],'2.22.3');
});
test('private media topology exposes gateway, never SFU signaling',()=>{
 const config=fs.readFileSync('infra/media/private-sfu.compose.yml','utf8');
 assert(config.includes(image));assert(config.includes('127.0.0.1:57880:7883'));assert(!config.includes('57880:7880'));assert(!config.includes('7880:7880'));
 assert(config.includes('cap_drop: [ALL]'));assert(config.includes('read_only: true'));assert(config.includes('no-new-privileges:true'));
});
