import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const file='quality/tasks.json';
const ledger=JSON.parse(fs.readFileSync(file,'utf8'));
const task=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert(task&&task.status==='BLOCKED');
const paths=['apps/web/components.json','apps/web/src/components/ui/classic.tsx'];
for(const p of paths)assert(!fs.existsSync(p),`Preserve existing file: ${p}`);
for(const p of paths)if(!task.writeAllowlist.includes(p))task.writeAllowlist.push(p);
task.scopeAmendments.push({recordedAt:new Date().toISOString(),paths,reason:'Direct user request: npx shadcn@latest add @toggles/classic. Install isolated source and minimal CLI configuration only. No theme integration or baseline adoption; preserve BLOCKED status.'});
const tracked=['apps/web/package.json','package-lock.json','apps/web/tsconfig.json','apps/web/vite.config.ts','apps/web/src/styles/global.css','apps/web/src/styles/tokens.css','apps/web/src/features/theme/ThemeSwitcher.tsx'];
const hashes=Object.fromEntries(tracked.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync('quality/evidence/LIGHT01-FE/classic-before.json',JSON.stringify({recordedAt:new Date().toISOString(),paths,hashes,gate:'BLOCKED: approved visual metadata awaiting reviewed baseline adoption',scope:'Installation explicitly authorized; no feature integration'},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
console.log('Pinned isolated Classic installation scope; LIGHT01-FE remains BLOCKED.');
