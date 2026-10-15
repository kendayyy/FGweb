import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T36-SUPPORT-DATA',hash=b=>createHash('sha256').update(b).digest('hex'),files=[];
for(const [p,transform,name]of [
 ['packages/database/src/index.ts',text=>text+"\nexport * from './schema/support.js';\n",'database-index1.ts'],
 ['packages/database/migrations/meta/_journal.json',text=>{const j=JSON.parse(text),last=j.entries.at(-1);assert.equal(last.idx,24);j.entries.push({idx:25,version:'7',when:Math.max(Date.now(),last.when+1),tag:'0025_support_requests',breakpoints:true});return JSON.stringify(j,null,2)+'\n';},'migration-journal1.json'],
]){const before=fs.readFileSync(p),after=transform(before.toString()),proposed=d+'/'+name;fs.writeFileSync(proposed,after,{flag:'wx'});files.push({path:p,proposed,beforeSha256:hash(before),afterSha256:hash(after)});}
fs.writeFileSync(d+'/database-integration-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Observed12real PostgreSQL REDs for absent support storage; export additive five-table schema and append0025journal entry without editing prior migrations. Preserve ownership/compiled baseline and real migration legacy data.',files},null,2)+'\n',{flag:'wx'});console.log('Prepared exact database export/journal integration; no main migration.');
