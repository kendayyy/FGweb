import fs from 'node:fs';
import {createHash} from 'node:crypto';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),owner=ledger.tasks.find(t=>t.id==='T24-FIX2'),latest=new Map();
for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(owner)))for(const [p,h] of Object.entries(t.outputsHash?.files??{}))latest.set(p,{owner:t.id,hash:h});
const allow=p=>owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const changed=[];for(const [p,h] of latest){const actual=createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(actual!==h.hash)changed.push({path:p,priorOwner:h.owner,currentOwnerScope:allow(p)});}
console.log(JSON.stringify({changed},null,2));
