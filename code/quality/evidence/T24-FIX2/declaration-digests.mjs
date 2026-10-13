import fs from 'node:fs';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),owner=ledger.tasks.find(t=>t.id==='T24-FIX2'),latest=new Map();
for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(owner)))for(const [p,h] of Object.entries(t.outputsHash?.files??{}))latest.set(p,{owner:t.id,hash:h});
const paths=['invitations/invitations.controller','invitations/invitations.service','permissions/permissions.controller','rooms/rooms.controller'].map(p=>`apps/api/dist/modules/${p}.d.ts`);
console.log(JSON.stringify(paths.map(path=>({path,previous:latest.get(path),actual:hash(path),fullBuild:hash(path.replace('apps/api/dist/','quality/evidence/T24-FIX2/derived-proof/'))})),null,2));
