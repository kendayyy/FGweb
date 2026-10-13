import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import webpush from 'web-push';
import {build} from 'esbuild';

const dir='quality/evidence/CHATCRYPTO-BE',label=process.argv[2];
assert(label&&/^[a-z0-9-]+$/.test(label));
const output=path.join(dir,`worker-stop-${label}-result.json`);assert(!fs.existsSync(output));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),envBytes=fs.readFileSync('.env.local'),envHash=sha(envBytes),env=parseEnv(envBytes.toString('utf8'));envBytes.fill(0);
const image='node@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd',id=randomUUID().replaceAll('-',''),schema='crypto_be_'+id,name='fg-crypto-worker-stop-'+id,application='fg-worker-stop-'+id;
assert(/^crypto_be_[a-f0-9]{32}$/.test(schema));assert(/^fg-crypto-worker-stop-[a-f0-9]{32}$/.test(name));
const parent=path.resolve('.runtime/chatcrypto-be'),runtime=path.join(parent,id),url=new URL(env.DATABASE_URL);
assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Fixture requires configured local PG');
const main=new pg.Pool({connectionString:url.href,max:2,connectionTimeoutMillis:5000,statement_timeout:10000});
const result={startedAt:new Date().toISOString(),image,productionReady:false,mainEnvironmentChanged:false,mainDatabaseChanged:false,gracefulStop:false,cleanup:false};let created=false,launched=false,stage='initialize';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
try{
 stage='image';assert(JSON.parse(docker(['image','inspect',image,'--format','{{json .RepoDigests}}'])).includes(image));
 assert.equal((await main.query("SELECT to_regclass('public.chat_crypto_state') AS crypto")).rows[0].crypto,null);
 fs.mkdirSync(parent,{recursive:true});assert(fs.realpathSync(parent).startsWith(fs.realpathSync('.')+path.sep));fs.mkdirSync(runtime);assert.equal(fs.realpathSync(runtime),path.join(fs.realpathSync(parent),id));
 stage='bundle';const bundled=await build({entryPoints:['apps/worker/dist/private-push-worker.js'],outfile:path.join(runtime,'worker.cjs'),bundle:true,platform:'node',format:'cjs',external:['pg-native'],metafile:true,logLevel:'silent'});
 result.bundleSha256=sha(fs.readFileSync(path.join(runtime,'worker.cjs')));result.bundleInputs=Object.fromEntries(Object.keys(bundled.metafile.inputs).sort().map(file=>{const absolute=path.resolve(file);assert(absolute.startsWith(path.resolve('.')+path.sep));return [file,sha(fs.readFileSync(absolute))];}));
 stage='schema';await main.query(`CREATE SCHEMA "${schema}"`);created=true;const ownUrl=new URL(url);ownUrl.searchParams.set('options','-c search_path='+schema);const own=new pg.Pool({connectionString:ownUrl.href,max:1,connectionTimeoutMillis:5000});
 try{const client=await own.connect();try{await migrate(drizzle(client),{migrationsFolder:'packages/database/migrations',migrationsSchema:schema});}finally{client.release();}assert.equal((await own.query('SELECT count(*)::integer AS count FROM notification_outbox')).rows[0].count,0);}finally{await own.end();}
 stage='configuration';const configuration={version:1,allowedOrigins:['https://fixture.invalid'],vapid:{...webpush.generateVAPIDKeys(),subject:'https://fixture.invalid/push'}};fs.writeFileSync(path.join(runtime,'private-push.json'),JSON.stringify(configuration),{flag:'wx',mode:0o600});const linuxUrl=new URL(ownUrl);linuxUrl.hostname='host.docker.internal';linuxUrl.searchParams.set('application_name',application);fs.writeFileSync(path.join(runtime,'worker.env'),'DATABASE_URL='+linuxUrl.href+'\nFG_PRIVATE_PUSH_CONFIG_FILE=/fixture/private-push.json\n',{flag:'wx',mode:0o600});
 stage='launch';docker(['run','--pull=never','--detach','--name',name,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--cpus=0.5','--pids-limit=64','--env-file',path.join(runtime,'worker.env'),'--mount','type=bind,source='+runtime+',target=/fixture,readonly',image,'node','/fixture/worker.cjs']);launched=true;result.nodeVersion=docker(['exec',name,'node','--version']);
 stage='readiness';const limit=Date.now()+30000;let initial;while(Date.now()<limit){assert.equal(docker(['inspect','--format','{{.State.Running}}',name]),'true');initial=(await main.query("SELECT query_start FROM pg_stat_activity WHERE application_name=$1 AND query LIKE 'SELECT o.id FROM notification_outbox%'",[application])).rows[0];if(initial)break;await new Promise(resolve=>setTimeout(resolve,250));}assert(initial,'Actual daemon did not reach owned job poll');await new Promise(resolve=>setTimeout(resolve,1300));const subsequent=(await main.query("SELECT query_start FROM pg_stat_activity WHERE application_name=$1 AND query LIKE 'SELECT o.id FROM notification_outbox%'",[application])).rows[0];assert(subsequent&&subsequent.query_start>initial.query_start,'Daemon must perform a subsequent real poll');result.nativeOwnedPoll=true;
 stage='sigterm';const stopAt=Date.now();docker(['kill','--signal','SIGTERM',name]);assert.equal(docker(['wait',name]),'0');result.stopMilliseconds=Date.now()-stopAt;assert(result.stopMilliseconds<5000);assert.equal(docker(['inspect','--format','{{.State.ExitCode}}',name]),'0');const logs=docker(['logs',name]);result.stdoutSha256=sha(logs);assert.equal(logs,'');assert.equal((await main.query('SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1',[application])).rows[0].count,0);assert.equal((await main.query(`SELECT count(*)::integer AS count FROM "${schema}".notification_outbox`)).rows[0].count,0);result.gracefulStop=true;
}catch(error){result.failedAt=stage;result.diagnosticSha256=sha(String(error));process.exitCode=1;}
finally{
 try{if(launched)docker(['rm','--force',name]);if(created)await main.query(`DROP SCHEMA "${schema}" CASCADE`);assert.equal((await main.query('SELECT to_regnamespace($1) AS owned',[schema])).rows[0].owned,null);assert.equal((await main.query("SELECT to_regclass('public.chat_crypto_state') AS crypto")).rows[0].crypto,null);assert.equal(sha(fs.readFileSync('.env.local')),envHash);if(fs.existsSync(runtime)){assert.equal(fs.realpathSync(runtime),path.join(fs.realpathSync(parent),id));fs.rmSync(runtime,{recursive:true});}result.cleanup=true;}catch(error){result.cleanupDiagnosticSha256=sha(String(error));process.exitCode=1;}await main.end();result.completedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({evidencePath:output,gracefulStop:result.gracefulStop,cleanup:result.cleanup,failedAt:result.failedAt??null}));
}
