import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const dir='quality/evidence/T19';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T19');
const allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p);
const files=()=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const snapshot=`${dir}/readonly-codex-resume.json`;
const readonly=()=>files().filter(f=>!allow(f)||f.startsWith(dir+'/')&&!f.startsWith(dir+'/codex-')&&!f.includes('/antigravity-run')&&!f.includes('/antigravity-error')&&!f.includes('/antigravity-exit')&&f!==snapshot);
if(process.argv[2]==='capture'){assert(!fs.existsSync(snapshot));fs.writeFileSync(snapshot,JSON.stringify(Object.fromEntries(readonly().map(f=>[f,hash(f)])),null,2)+'\n');console.log('Readonly runner snapshot captured');process.exit(0);}
const old=JSON.parse(fs.readFileSync(snapshot));for(const [f,h]of Object.entries(old))assert.equal(hash(f),h,f);
assert(files().every(f=>f in old||allow(f)),'Unexpected new source outside task');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
for(const [k,f]of Object.entries({specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'}))assert.equal(hash(f),baseline.hashes[k].toLowerCase());
const frozen=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))frozen.set(f,h);
let verified=0;for(const [f,h]of frozen)if(!allow(f)){assert.equal(hash(f),h.toLowerCase(),f);verified++;}
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const f of files().filter(f=>allow(f)))assert(!secrets.some(s=>fs.readFileSync(f).includes(Buffer.from(s))),'Configured secret in task file');
console.log(JSON.stringify({baselines:5,readonlySnapshotFiles:Object.keys(old).length,frozenPredecessorFiles:verified,scope:true,configuredSecretLeak:false}));
