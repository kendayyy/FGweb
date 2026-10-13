import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
export const dir='quality/evidence/CHATCRYPTO-DATA';
export const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const allow=(p,patterns)=>patterns.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
export const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
export function audit(){
 const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA'),before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);assert.equal(ledger.activeCheckpoint,null);
 assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
 for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,old.id);
 for(const id of ['T01-FIX4','T02-FIX3']){const setup=ledger.followups.find(t=>t.id===id);assert.equal(setup.status,'PASS');for(const [p,h]of Object.entries(setup.outputsHash.files))assert.equal(hash(p),h,p);}
 for(const [p,h]of Object.entries(task.setupOutputAdoption.files))assert.equal(hash(p),h,p);
 for(const [p,h]of Object.entries(before.readonly))if(!allow(p,task.writeAllowlist))assert.equal(hash(p),h,p);
 assert.equal(hash('.env.local'),before.configuration.env);
 for(const id of ['CHATCRYPTO-BE','CHATCRYPTO-FE','CHATCRYPTO-QA','T29'])assert.equal(ledger.tasks.find(t=>t.id===id).status,'NOT_STARTED',id);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/')&&fs.existsSync(p));
 const historicalOwners=new Map(Object.entries(JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-CHATCRYPTO01/readonly-after-bootstrap.json'))));
 for(const old of before.historical)for(const [p,h]of Object.entries(old.outputsHash?.files??{}))historicalOwners.set(p,h);
 for(const p of files)if(!allow(p,task.writeAllowlist)){const original=before.readonly[p]??historicalOwners.get(p);assert(original,`Unexpected source outside DATA: ${p}`);assert.equal(hash(p),original,p);}
 const baselineDir=`${dir}/baseline-migrations`;
 for(const p of walk(baselineDir)){const relative=p.slice(baselineDir.length+1);if(relative!=='meta/_journal.json')assert.equal(hash(p),hash(`packages/database/migrations/${relative}`),relative);}
 const oldJournal=JSON.parse(fs.readFileSync(`${baselineDir}/meta/_journal.json`)),journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json'));
 assert.deepEqual(journal.entries.slice(0,oldJournal.entries.length),oldJournal.entries);assert.equal(journal.entries.length,14);
 for(const entry of journal.entries){assert(fs.existsSync(`packages/database/migrations/${entry.tag}.sql`));assert(fs.existsSync(`packages/database/migrations/meta/${String(entry.idx).padStart(4,'0')}_snapshot.json`));}
 for(const [source,migration]of [['crypto-envelope-validation.sql','0009_outgoing_shatterstar.sql'],['crypto-protocol-validation.sql','0010_boring_epoch.sql'],['crypto-public-key-validation.sql','0011_lame_tombstone.sql'],['crypto-olm-validation.sql','0012_huge_wind_dancer.sql']])assert(fs.readFileSync(`packages/database/migrations/${migration}`,'utf8').startsWith(fs.readFileSync(`packages/database/src/${source}`,'utf8').trimEnd()),source);
 const native=JSON.parse(fs.readFileSync(`${dir}/native-interop/matrix-result.json`));
 for(const name of ['nativeTwoParty','ciphertextTamperDenied','crossRoomDenied','unverifiedNotShared','joinNoOldHistory','leaveRotatesAndRevokes','encryptedRecovery','wrongRecoveryDenied','newRecoveryDeviceIdentity','sasVerificationVerified','crossSigningContracts'])assert.equal(native[name],true,name);
 assert.equal(native.sdk,'18.6.0');assert.equal(native.productionAdapter,false);assert(!native.cleanupFailure);assert(native.richCiphertextChars>24576&&native.richCiphertextChars<=131072);
 const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));
 for(const record of records){assert.equal(hash(record.evidencePath),record.evidenceSha256,record.evidencePath);assert.equal(record.cwd,process.cwd());assert(Date.parse(record.startedAt)<=Date.parse(record.completedAt));}
 const env=parseEnv(fs.readFileSync('.env.local','utf8'));
 const secrets=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8).map(([,value])=>Buffer.from(value));
 for(const p of [...walk(dir),...walk('quality/crypto')])for(const secret of secrets)assert(!fs.readFileSync(p).includes(secret),`Configured secret leaked in ${p}`);
 assert(fs.readFileSync('quality/api-contract.md','utf8').includes('CHAT-CRYPTO-01 — DATA protocol contract'));
 return {recordedAt:new Date().toISOString(),task:task.id,baselines:8,historicalPassRecordsUnchanged:before.historical.length,setupOutputAdoptionVerified:true,sourceScopeVerified:true,oldMigrationsPreserved:true,migrationEntries:14,configuredSecretsScan:'PASS',environmentUnchanged:true,nativeSdkFlags:11,richCiphertextChars:native.richCiphertextChars,applicationE2eeImplemented:false,backendFrontendQaNotStarted:true};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/final-audit.mjs')){
 const result=audit(),env=parseEnv(fs.readFileSync('.env.local','utf8')),client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
 try{await client.connect();await client.query('BEGIN READ ONLY');const current=(await client.query("SELECT current_schema() AS schema,to_regclass('chat_crypto_state') AS state")).rows[0];assert.equal(current.state,null,'Main application crypto migration must remain unapplied in DATA');const fixtures=(await client.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname ~ '^chatcrypto_[a-f0-9]{32}(_empty)?$'")).rows[0].count;assert.equal(fixtures,0);await client.query('ROLLBACK');result.mainDatabaseCryptoMigrationAbsent=true;result.ownedSchemasCleaned=true;}finally{await client.end();}
 fs.writeFileSync(`${dir}/final-audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
