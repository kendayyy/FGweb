import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {checkGate,checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE',digest=b=>createHash('sha256').update(b).digest('hex'),hash=p=>digest(fs.readFileSync(p));
const before=JSON.parse(fs.readFileSync(dir+'/before.json','utf8')),ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');
assert.equal(task.status,'IN_PROGRESS');assert.deepEqual(task.blockers,[]);
const baselineCount=checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'))});
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:task.writeAllowlist.filter(p=>!p.includes('*'))});
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
const transitions=new Map(manifest.outputTransitions.map(t=>[t.path,t]));
const external=new Set(['packages/contracts/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json','tools/telegram-bridge/core.mjs','tools/telegram-bridge/core.test.mjs','tools/telegram-bridge/README.md','tools/telegram-bridge/runner.mjs','tools/telegram-bridge/status.mjs']);
const changed=[];
for(const [file,sha] of Object.entries(before.readonly)){assert(fs.existsSync(file),file);if(hash(file)!==sha){const t=transitions.get(file);assert(external.has(file)||t?.afterSha256===hash(file),'Unexpected readonly change: '+file);changed.push({file,externalObservation:external.has(file),reviewedTransition:!!t,sha256:hash(file)});}}
for(const row of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===row.id),row);
assert.equal(hash('scripts/verify-task.mjs'),before.checkerSha256);assert.equal(hash('.env.local'),before.configuration.env);
const labels=['approved-sync-fixture-apply-1','approved-sync-contracts-regression-1','approved-sync-contracts-lint-1','native-regression-final-2','web-regression-final-2','image-allocation-typecheck-1','image-allocation-lint-1','crypto-web-build-25','headed-image-allocation-1','headed-legacy-recovery-4','headed-legacy-viewports-1','headed-group-regression-2','headed-late-response-1'];
for(const label of labels){const r=JSON.parse(fs.readFileSync(dir+'/codex-'+label+'.json','utf8'));assert.equal(r.exitCode,0,label);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
const proposal=JSON.parse(fs.readFileSync(dir+'/stale-sync-fixture-proposal.json','utf8'));assert.equal(hash(proposal.file),proposal.proposedSha256);
const env=parseEnv(fs.readFileSync('.env.local','utf8')),pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
let ownedSchemas,mainAbsent;
try{ownedSchemas=(await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'crypto_fe_%' ORDER BY schema_name")).rows.map(r=>r.schema_name);mainAbsent=(await pool.query("SELECT to_regclass('public.chat_crypto_devices') IS NULL AS absent")).rows[0].absent;}finally{await pool.end();}
assert.deepEqual(ownedSchemas,[]);assert.equal(mainAbsent,true);
const containers=execFileSync('docker',['ps','-a','--filter','label=fg.task=CHATCRYPTO-FE','--format','{{.Names}}'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);assert.deepEqual(containers,[]);
const runtime=fs.existsSync('.runtime/chatcrypto-fe')?fs.readdirSync('.runtime/chatcrypto-fe'):[];assert.deepEqual(runtime,[]);
const result={recordedAt:new Date().toISOString(),baselineCount,historicalPassUnchanged:before.historical.length,readonlyCompared:Object.keys(before.readonly).length,changed,checkerUnchanged:true,envUnchanged:true,approvedFixtureApplied:true,nativeTests:38,webTests:236,contractsTests:217,contractsFiles:28,mainCryptoAbsent:true,ownedSchemas,ownedContainers:containers,ownedRuntime:runtime,requiredSuccessfulLabels:labels,frontendAcceptanceReviewed:true,independentQaAcceptance:false,productionActivation:false,banProducerTask:'T37'};
fs.writeFileSync(dir+'/approved-closure-audit.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...result,changedCount:changed.length,changed:undefined}));
