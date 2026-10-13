import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/LIGHT01-FE/smoke';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(dir,{recursive:true});
assert(!fs.existsSync(`${dir}/before.json`));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const owner=ledger.tasks.find(t=>t.id==='LIGHT01-FE');
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
const metadata=['quality/tasks.json','quality/spec-baseline.json','quality/spec-coverage.md'];
const allow=p=>metadata.includes(p)||owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const latest=new Map();
for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(owner))){assert.equal(t.status,'PASS');for(const [p,h]of Object.entries(t.outputsHash?.files??{}))latest.set(p,h);}
let frozen=0;for(const [p,h]of latest)if(!allow(p)){assert.equal(hash(p),h,`Frozen output changed: ${p}`);frozen++;}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&!allow(p));
const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'};
for(const [key,name]of Object.entries({mockupLobbySha256:'01-lobby-desktop-mobile.png',mockupCallSha256:'02-group-call-live.png',mockupFeedSha256:'03-community-feed-desktop-mobile.png',mockupAuthSha256:'04-login-desktop-mobile.png',mockupAdminSha256:'05-admin-support-desktop.png'}))assert.equal(hash(`../.doc/mockups/${name}`),baseline.hashes[key]);
const references=['../.doc/mockups/fg-light-smoke-approved.png','../.doc/mockups/fg-dark-smoke-approved.png','../.doc/mockups/08-sidebar-fixed-compact-preview.png'];
const approval=JSON.parse(fs.readFileSync('quality/evidence/LIGHT01-FE/switcher-concepts/theme-approval.json'));
assert(approval,'Preserve approved reference record');
fs.writeFileSync(`${dir}/previous-baseline.json`,JSON.stringify(baseline,null,2)+'\n');
fs.writeFileSync(`${dir}/previous-ledger.json`,JSON.stringify(ledger,null,2)+'\n');
for(const [key,p]of Object.entries(docs))fs.copyFileSync(p,`${dir}/${key}.md`);
const nextHashes={...baseline.hashes,...Object.fromEntries(Object.entries(docs).map(([key,p])=>[key,hash(p)]))};
const change={id:'THEME-VISUAL-02-CLASSIC',adoptedAt:new Date().toISOString(),previousHashes:baseline.hashes,hashes:nextHashes,authorization:'Direct user request to build approved light/dark smoke themes and integrate installed Classic',evidence:'quality/evidence/LIGHT01-FE/smoke-plan.md',references:Object.fromEntries(references.map(p=>[p,hash(p)])),scope:'Reviewed spec15/design12/task LIGHT changes; additive previously verified game/logo sidebar handoff retained and deferred. Original product sections, five mockups, historic outputs/evidence unchanged; new smoke implementation requires new tests/app review.'};
baseline.amendments.push(change);baseline.hashes=nextHashes;
baseline.additionalRequirements.THEME_VISUAL_02={ownerTask:owner.id,status:'IN_PROGRESS',visualApproval:'MOCKUPS_APPROVED_REAL_APP_PENDING',references:change.references};
baseline.additionalRequirements.GAME_LOGO_01={ownerTask:'GAME-LOGO-FE',status:'NOT_STARTED',after:'LIGHT01-FE',sidebar:'SIDEBAR-COMPACT-APPROVED',scope:'Metadata adopted only; future owner gate required'};
for(const t of ledger.tasks){t.baselineAdoptions??=[];t.baselineAdoptions.push({previousSpecSha256:t.specSha256,newSpecSha256:nextHashes.specSha256,reviewTask:owner.id,evidence:`${dir}/adoption.json`,scopeImpact:t.status==='PASS'?'Historical result/outputs preserved; not coverage of new smoke/logo/sidebar requirements':'Approved owner requirements apply in sequence; no future task opened'});t.specSha256=nextHashes.specSha256;}
owner.status='IN_PROGRESS';owner.blockers=[];
owner.evidencePaths.push(`${dir}/adoption.json`,'quality/evidence/LIGHT01-FE/smoke-plan.md');
fs.writeFileSync(`${dir}/adoption.json`,JSON.stringify(change,null,2)+'\n');
fs.writeFileSync(`${dir}/before.json`,JSON.stringify({recordedAt:new Date().toISOString(),readonly:Object.fromEntries(files.map(p=>[p,hash(p)])),frozenOutsideOwner:frozen,configuration:{env:hash('.env.local'),adminInput:hash('.runtime/auth-admin/admin-input.env')},documents:Object.fromEntries(Object.values(docs).map(p=>[p,hash(p)]))},null,2)+'\n');
fs.writeFileSync('quality/spec-baseline.json',JSON.stringify(baseline,null,2)+'\n');
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({owner:owner.id,status:owner.status,approvedDocsAdopted:true,historicalOutputsChanged:false,frozenOutsideOwner:frozen,readonlyFiles:files.length,nextTaskOpened:false}));
