import fs from 'node:fs';
const file='quality/tasks.json';
const ledger=JSON.parse(fs.readFileSync(file,'utf8'));
const task=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
const paths=['apps/web/tsconfig.json','apps/web/vite.config.ts'];
for(const p of paths)if(!task.writeAllowlist.includes(p))task.writeAllowlist.push(p);
task.scopeAmendments.push({recordedAt:new Date().toISOString(),paths,reason:'Classic installation prerequisite: CLI rejects unresolved aliases. Define matching @/* source paths for TypeScript and Vite only, pursuant to direct install request and persistent scope authorization; no theme/business integration.'});
fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
console.log('Pinned TypeScript/Vite alias prerequisites.');
