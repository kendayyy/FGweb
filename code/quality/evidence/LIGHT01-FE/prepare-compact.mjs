import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/LIGHT01-FE/compact';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(dir,{recursive:true});
assert(!fs.existsSync(`${dir}/before.json`));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const owner=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
const scope=['apps/web/src/features/theme/theme.ts','apps/web/src/features/theme/ThemeProvider.tsx','apps/web/src/features/theme/ThemeSwitcher.tsx','apps/web/src/features/theme/theme.css','apps/web/index.html','apps/web/test/theme.test.tsx','tests/e2e/theme.spec.ts'];
const matches=(p,patterns)=>patterns.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
for(const p of scope)assert(matches(p,owner.writeAllowlist),`Missing authorized owner scope: ${p}`);
const allow=p=>['quality/tasks.json','quality/spec-baseline.json','quality/spec-coverage.md'].includes(p)||matches(p,owner.writeAllowlist);
const latest=new Map();
for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(owner))){assert.equal(t.status,'PASS');for(const [p,h]of Object.entries(t.outputsHash?.files??{}))latest.set(p,h);}
const history=JSON.parse(fs.readFileSync('quality/evidence/LIGHT01-FE/smoke/history-adoption.json'));
for(const [p,h]of latest)if(!allow(p)){
 if(p==='AGENTS.md'){assert.equal(h,history.beforeCodeAgentsSha256);assert.equal(hash(p),history.codeAgentsSha256);}
 else assert.equal(hash(p),h,`Frozen output changed: ${p}`);
}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'};
const source=['../.doc/mockups/fg-light-smoke-approved.png','../.doc/mockups/fg-dark-smoke-approved.png','../.doc/mockups/fg-theme-icon-only-proposal.png'];
const previousHashes={...baseline.hashes};
const nextHashes={...previousHashes,...Object.fromEntries(Object.entries(docs).map(([k,p])=>[k,hash(p)]))};
const historical=ledger.tasks.filter(t=>t.status==='PASS').map(t=>({id:t.id,status:t.status,outputsHash:t.outputsHash,commands:t.commands,evidencePaths:t.evidencePaths}));
const before={at:new Date().toISOString(),scope,readonly:Object.fromEntries(files.filter(p=>!allow(p)).map(p=>[p,hash(p)])),configuration:{env:hash('.env.local'),adminInput:hash('.runtime/auth-admin/admin-input.env')},documents:Object.fromEntries(Object.values(docs).map(p=>[p,hash(p)])),historical,ownerStatus:owner.status};
fs.writeFileSync(`${dir}/before.json`,JSON.stringify(before,null,2)+'\n');
for(const p of scope){const target=`${dir}/source-before/${p}`;fs.mkdirSync(target.slice(0,target.lastIndexOf('/')),{recursive:true});fs.copyFileSync(p,target);}
const change={id:'THEME-COMPACT-02',adoptedAt:new Date().toISOString(),previousHashes,hashes:nextHashes,authorization:'User approved icon-only mockup and explicitly requested implementation; replaces three choices with two',references:Object.fromEntries(source.map(p=>[p,hash(p)])),scope,evidence:`${dir}/before.json`,migration:'Existing light/dark retained; legacy system resolved once and persisted; missing/invalid/blocked storage defaults dark; no live OS subscription'};
baseline.amendments.push(change);baseline.hashes=nextHashes;
baseline.additionalRequirements.THEME_COMPACT_02={ownerTask:owner.id,status:'IN_PROGRESS',visualApproval:'MOCKUP_APPROVED_APP_PENDING',references:change.references};
for(const t of ledger.tasks){t.baselineAdoptions??=[];t.baselineAdoptions.push({id:change.id,adoptedAt:change.adoptedAt,previousSpecSha256:t.specSha256,specSha256:nextHashes.specSha256,evidence:`${dir}/adoption.json`});t.specSha256=nextHashes.specSha256;}
owner.evidencePaths.push(`${dir}/before.json`,`${dir}/adoption.json`);
fs.writeFileSync(`${dir}/adoption.json`,JSON.stringify(change,null,2)+'\n');
fs.writeFileSync('quality/spec-baseline.json',JSON.stringify(baseline,null,2)+'\n');
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:owner.id,status:owner.status,scope,readonlyFiles:Object.keys(before.readonly).length,baselineAdopted:change.id,historicalOutputsChanged:false}));
