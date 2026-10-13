import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const name='@matrix-org/matrix-sdk-crypto-wasm';
test('SDK is exact in web manifest and lock with approved registry integrity',()=>{
 const manifest=JSON.parse(fs.readFileSync('apps/web/package.json'));
 const lock=JSON.parse(fs.readFileSync('package-lock.json'));
 const candidate=JSON.parse(fs.readFileSync('quality/evidence/CHATCRYPTO-DATA/registry-candidate.json'));
 assert.equal(manifest.dependencies[name],'18.6.0');
 const entry=lock.packages[`node_modules/${name}`];
 assert.equal(entry.version,'18.6.0');assert.equal(entry.integrity,candidate.dist.integrity);
 assert.equal(lock.packages['apps/web'].dependencies[name],'18.6.0');
});
test('installation preserves every existing direct and locked dependency version',()=>{
 const before=JSON.parse(fs.readFileSync('quality/evidence/T01-FIX4/before.json'));
 const manifest=JSON.parse(fs.readFileSync('apps/web/package.json'));
 const lock=JSON.parse(fs.readFileSync('package-lock.json'));
 for(const section of ['dependencies','devDependencies'])for(const [n,v]of Object.entries(before.originalManifest[section]))assert.equal(manifest[section][n],v,n);
 for(const [p,entry]of Object.entries(before.originalLock.packages))if(entry.version)assert.equal(lock.packages[p]?.version,entry.version,p);
});
test('native WASM initializes independent device identities and signed outgoing requests',async()=>{
 const sdk=await import(name);
 await sdk.initAsync();
 const machines=[];
 try{
  const user=new sdk.UserId('@setup:fg.invalid');
  for(const device of ['SETUP_A','SETUP_B'])machines.push(await sdk.OlmMachine.initialize(user,new sdk.DeviceId(device)));
  assert.notEqual(machines[0].identityKeys.ed25519.toBase64(),machines[1].identityKeys.ed25519.toBase64());
  assert.notEqual(machines[0].identityKeys.curve25519.toBase64(),machines[1].identityKeys.curve25519.toBase64());
  for(const machine of machines){
   const requests=await machine.outgoingRequests();
   const upload=requests.find(r=>r.type===sdk.RequestType.KeysUpload);
   assert(upload,'native device key upload request missing');
   const body=JSON.parse(upload.body);
   assert.equal(body.device_keys.user_id,'@setup:fg.invalid');
   assert(Object.keys(body.one_time_keys).length>0);
   assert(Object.keys(body.device_keys.signatures['@setup:fg.invalid']).length>0);
   assert.equal(await machine.markRequestAsSent(upload.id,upload.type,JSON.stringify({one_time_key_counts:{signed_curve25519:Object.keys(body.one_time_keys).length}})),true);
  }
 }finally{for(const machine of machines)machine.close();}
});
