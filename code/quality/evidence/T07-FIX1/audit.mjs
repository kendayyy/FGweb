import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const head='0310a14691ebbdf618f25b065565827ea500cfb5';
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'));
for(const [key,file]of Object.entries({specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'}))assert.equal(hash(file),baseline.hashes[key].toLowerCase());
const changed=execFileSync('git',['diff','--relative','--name-only',head],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const source=['packages/database/src/schema/realtime-outbox.ts','packages/database/src/index.ts','packages/database/test/realtime-outbox.test.ts','packages/database/migrations/0004_demonic_tenebrous.sql','packages/database/migrations/meta/0004_snapshot.json','packages/database/migrations/meta/_journal.json'];
assert([...changed,...untracked].every(file=>source.includes(file)||file.startsWith('quality/evidence/T07-FIX1/')||['quality/tasks.json','quality/spec-coverage.md'].includes(file)),'Out-of-scope edit');
const previous=JSON.parse(execFileSync('git',['show',`${head}:code/packages/database/migrations/meta/_journal.json`],{encoding:'utf8'}));
const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json','utf8'));
assert.deepEqual(journal.entries.slice(0,4),previous.entries);assert.equal(journal.entries.length,5);
for(const entry of previous.entries){const file=`packages/database/migrations/${entry.tag}.sql`;assert(fs.readFileSync(file).equals(execFileSync('git',['show',`${head}:code/${file}`])));}
const ddl=fs.readFileSync(source[3],'utf8');assert(!/(?:^|;)\s*(DROP|TRUNCATE|DELETE)\b/im.test(ddl));assert(!ddl.includes('"public".'));
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)&&value.length>=8).map(([,value])=>value);
for(const file of [...changed,...untracked])assert(!secrets.some(secret=>fs.readFileSync(file).includes(Buffer.from(secret))),'Configured secret leaked');
const client=new pg.Client({connectionString:env.DATABASE_URL,query_timeout:10000,connectionTimeoutMillis:5000});await client.connect();
try{assert.equal((await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 't07_fix1_%'")).rowCount,0);assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n,0);}finally{await client.end();}
console.log(JSON.stringify({approvedBaselines:5,oldMigrationsUnchanged:4,additiveMigration:true,configuredSecretLeak:false,remainingOwnedSchemas:0,publicTables:0}));
