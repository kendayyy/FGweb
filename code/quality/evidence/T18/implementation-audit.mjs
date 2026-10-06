import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'));
for(const [k,f] of Object.entries({specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'}))assert.equal(hash(f),baseline.hashes[k].toLowerCase());
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')), task=ledger.tasks.find(t=>t.id==='T18');
const changed=execFileSync('git',['diff','--relative','--name-only',task.inputsHash],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const allows=f=>['quality/tasks.json','quality/spec-coverage.md'].includes(f)||task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p);
assert([...changed,...untracked].every(allows),'Out of approved scope');
const frozen=new Map(); for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))frozen.set(f,h);
const mounts=['apps/api/src/app.module.ts'];
let checked=0; for(const [f,h]of frozen)if(!mounts.includes(f)){assert.equal(hash(f),h.toLowerCase(),f);checked++;}
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const f of [...changed,...untracked])assert(!secrets.some(s=>fs.readFileSync(f).includes(Buffer.from(s))),'Configured secret leaked');
const db=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000}); await db.connect();
try{assert.equal((await db.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't18_%'")).rowCount,0);assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n,0);}finally{await db.end();}
console.log(JSON.stringify({baselinesVerified:5,frozenOutputsVerified:checked,scopeVerified:true,secretLeak:false,ownedSchemasRemaining:0,publicTables:0}));

