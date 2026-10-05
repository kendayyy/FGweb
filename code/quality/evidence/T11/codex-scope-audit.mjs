import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'));
const docs={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'};
for(const [key,file]of Object.entries(docs))assert.equal(digest(file).toLowerCase(),baseline.hashes[key].toLowerCase(),'Approved baseline changed');
const allowed=file=>['apps/web/src/features/profiles/','apps/web/src/features/onboarding/','quality/evidence/T11/'].some(prefix=>file.startsWith(prefix))||['apps/web/test/profiles.test.tsx','tests/e2e/onboarding.spec.ts','apps/web/src/App.tsx','apps/web/src/features/auth/HeaderAuthWidget.tsx','quality/tasks.json','quality/spec-coverage.md'].includes(file);
const changed=execFileSync('git',['diff','--relative','--name-only','8f630bec226b615f6d61474342785bf2ac002343'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
assert([...changed,...untracked].every(allowed),'Unexpected file changed outside T11 scope');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)&&value.length>=8).map(([,value])=>value);
const scan=[...files('quality/evidence/T11'),...files('apps/web/src/features/profiles'),...files('apps/web/src/features/onboarding'),'apps/web/test/profiles.test.tsx','tests/e2e/onboarding.spec.ts'];
for(const file of scan)assert(!secrets.some(secret=>fs.readFileSync(file).includes(Buffer.from(secret))),'Configured secret in task output');
const client=new pg.Client({connectionString:env.DATABASE_URL});await client.connect();
try{
 const schemas=await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't11_%'");
 assert.equal(schemas.rowCount,0,'Owned T11 schema remains');
 const publicTables=await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
 assert.equal(publicTables.rows[0].count,0,'Public database schema unexpectedly modified');
}finally{await client.end();}
const nativeLog=fs.readFileSync('quality/evidence/T11/codex-e2e-final-owner-edits.txt','utf8');
const pids=[...nativeLog.matchAll(/Owned (?:API|web) PID:\s*(\d+)/g)].map(match=>Number(match[1]));assert.equal(pids.length,2,'Owned PID proof missing');
for(const pid of pids){let alive=false;try{process.kill(pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')throw error;}assert(!alive,'Owned test child remains');}
console.log(JSON.stringify({approvedBaselines:5,changedFiles:changed.length,untrackedFiles:untracked.length,scannedFiles:scan.length,configuredSecretLeak:false,remainingOwnedSchemas:0,publicTables:0,ownedPidsStopped:pids}));
