import fs from 'node:fs';
import {createHash} from 'node:crypto';
const from='quality/evidence/T27/private-gateway-fixture.mjs',to='quality/evidence/T28/private-gateway-fixture.mjs';
const old=fs.readFileSync(from,'utf8'),content=old.replaceAll('.runtime/t27/','.runtime/t28/');
fs.writeFileSync(to,content,{flag:'wx'});
const sha=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync('quality/evidence/T28/fixture-provenance.json',JSON.stringify({source:from,sourceSha:sha(old),target:to,targetSha:sha(content),changes:'Only owned runtime path t27 -> t28; native image, auth, grants and private network unchanged.'},null,2)+'\n');
