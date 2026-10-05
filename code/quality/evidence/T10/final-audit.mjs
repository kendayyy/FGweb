import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'));
const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'};
for(const [key,file]of Object.entries(docs))assert.equal(digest(file).toLowerCase(),baseline.hashes[key].toLowerCase(),'Approved document baseline changed');
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)&&value.length>=8).map(([,value])=>value);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const scanned=[...files('quality/evidence/T10'),...files('apps/api/src/modules/profiles'),'apps/api/src/app.module.ts','apps/api/test/profiles.integration.spec.ts'];
for(const file of scanned){const content=fs.readFileSync(file,'utf8');assert(!secrets.some(secret=>content.includes(secret)),'Configured secret leaked in task output');}
const client=new pg.Client({connectionString:env.DATABASE_URL});await client.connect();
try{
 const schemas=await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_t10_%' OR nspname LIKE 't10_codex_%' OR nspname LIKE 't10_native_%'");
 assert.equal(schemas.rowCount,0,'Owned test schema remains');
 const publicTables=await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
 assert.equal(publicTables.rows[0].count,0,'Public database schema unexpectedly modified');
}finally{await client.end();}
const nativeLog=fs.readFileSync('quality/evidence/T10/final-native.txt','utf8');
const pids=[...nativeLog.matchAll(/owned PID:\s*(\d+)/g)].map(match=>Number(match[1]));assert(pids.length>0,'Native process ownership proof missing');
for(const pid of pids){let alive=false;try{process.kill(pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')throw error;}assert(!alive,'Owned native child remains alive');}
console.log(JSON.stringify({approvedBaselines:5,scannedFiles:scanned.length,configuredSecretLeak:false,remainingOwnedSchemas:0,publicTables:0,ownedNativePidsStopped:pids}));
