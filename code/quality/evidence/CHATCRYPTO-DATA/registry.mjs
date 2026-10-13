import fs from 'node:fs';
import assert from 'node:assert/strict';
const url='https://registry.npmjs.org/@matrix-org%2fmatrix-sdk-crypto-wasm/18.6.0',response=await fetch(url);
assert(response.ok,`Official npm metadata unavailable: HTTP${response.status}`);const metadata=await response.json();assert.equal(metadata.version,'18.6.0');assert(!metadata.version.includes('-'));
const selected={recordedAt:new Date().toISOString(),url,name:metadata.name,version:metadata.version,license:metadata.license,engines:metadata.engines,dist:{integrity:metadata.dist.integrity,shasum:metadata.dist.shasum,tarball:metadata.dist.tarball},installed:false,selectedByHuman:false};
fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/registry-candidate.json',JSON.stringify(selected,null,2)+'\n');console.log(JSON.stringify({name:selected.name,version:selected.version,license:selected.license,engines:selected.engines,installed:false}));
