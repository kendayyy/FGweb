import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const original='quality/evidence/T31/private-gateway-regression-linux1.mjs',target='quality/evidence/T32/private-gateway-t32-linux1.mjs',bytes=fs.readFileSync(original,'utf8');
assert(!/\bagy\b|Start-Process|cockpit-tools/i.test(bytes));
const next=bytes.replaceAll('fg-t31-regression-gateway-','fg-t32-external-gateway-').replaceAll('.runtime/t31/gateway-','.runtime/t32/gateway-');
assert.equal(next.replaceAll('fg-t32-external-gateway-','fg-t31-regression-gateway-').replaceAll('.runtime/t32/gateway-','.runtime/t31/gateway-'),bytes);
fs.writeFileSync(target,next,{flag:'wx'});
const h=s=>createHash('sha256').update(s).digest('hex');fs.writeFileSync('quality/evidence/T32/native-helper-source-review1.json',JSON.stringify({at:new Date().toISOString(),reviewer:'Codex',original:{path:original,sha256:h(bytes)},copy:{path:target,sha256:h(next)},reversible:true,changes:['own container/network prefix','own private runtime prefix'],dependencyVolume:'Existing T30 pinned public dependency cache remains read-only and unmodified.',scope:'New synthetic native SFU and production gateway, loopback binding, teardown owned identifiers only; no host/service settings changes.',unresolvedSourceFindings:[]},null,2)+'\n',{flag:'wx'});
