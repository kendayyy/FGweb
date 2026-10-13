import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),files={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.posix.join(dir,e.name);if(e.isDirectory())walk(p);else files[p]=h(p);}}
walk('apps/api/dist');
fs.writeFileSync('quality/evidence/T30/api-build-before.json',JSON.stringify({recordedAt:new Date().toISOString(),files},null,2)+'\n',{flag:'wx'});
console.log('Pinned complete existing API build hashes.');
