import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE';
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const digest=value=>createHash('sha256').update(value).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),index=ledger.tasks.findIndex(row=>row.id==='CHATCRYPTO-FE'),task=ledger.tasks[index];
const before=JSON.parse(fs.readFileSync(`${dir}/sas-sql-before.json`,'utf8'));
assert.equal(task.status,'IN_PROGRESS');for(const row of ledger.tasks.filter(row=>row.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
const source='packages/database/src/crypto-protocol-validation.sql',journal='packages/database/migrations/meta/_journal.json',migration='packages/database/migrations/0022_chat_crypto_verification_flow.sql';
const oldSource=fs.readFileSync(`${dir}/sas-sql-original-0.txt`,'utf8');
const old=" IF kind<>'m.room_key.withheld' AND (jsonb_typeof(body->'transaction_id') IS DISTINCT FROM 'string' OR body->>'transaction_id' IS DISTINCT FROM transaction_id) THEN RETURN false; END IF;";
const updated=oldSource.replace(old," IF transaction_id IS NULL OR length(transaction_id) NOT BETWEEN 1 AND 128 THEN RETURN false; END IF;\n IF kind<>'m.room_key.withheld' AND (jsonb_typeof(body->'transaction_id') IS DISTINCT FROM 'string' OR length(body->>'transaction_id') NOT BETWEEN 1 AND 128) THEN RETURN false; END IF;");
assert.equal(fs.readFileSync(source,'utf8'),updated);
assert.equal(fs.readFileSync(migration,'utf8'),'-- Additive native SAS HTTP transport / verification flow distinction.\n-- Preserve all prior migrations, tables, stored rows, dedup and authorization.\n'+updated.replace('CREATE FUNCTION chat_crypto_valid_protocol_event','CREATE OR REPLACE FUNCTION chat_crypto_valid_protocol_event'));
assert.equal(hash('packages/database/migrations/0010_boring_epoch.sql'),before.files['packages/database/migrations/0010_boring_epoch.sql']);
const oldJournal=JSON.parse(fs.readFileSync(`${dir}/sas-sql-original-1.txt`,'utf8')),newJournal=JSON.parse(fs.readFileSync(journal,'utf8'));
assert.deepEqual({...newJournal,entries:newJournal.entries.slice(0,-1)},oldJournal);assert.equal(newJournal.entries.at(-1).idx,22);assert.equal(newJournal.entries.at(-1).tag,'0022_chat_crypto_verification_flow');
const proofPaths=[`${dir}/sas-sql-before.json`,`${dir}/sas-sql-scope-review.md`,migration];
for(const label of ['sas-sql-native-green-1','sas-migration-native-1','frontend-http-native-4']){
 const path=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(path,'utf8'));assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);proofPaths.push(path,record.evidencePath);
}
const latest=new Map();for(const row of ledger.tasks.slice(0,index))for(const [path,sha]of Object.entries(row.outputsHash?.files??{}))latest.set(path,{id:row.id,sha});
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
const amendment=task.approvedScopeAmendments.find(value=>value.source===`${dir}/sas-sql-scope-review.md`);assert(amendment);
for(const path of [source,journal]){
 const prior=latest.get(path);assert(prior);assert.equal(prior.sha,before.files[path]);assert(!manifest.outputTransitions.some(entry=>entry.path===path));
 manifest.outputTransitions.push({path,previousTaskId:prior.id,beforeSha256:prior.sha,afterSha256:hash(path),scopeSha256:digest(JSON.stringify(amendment)),requiredEvidence:proofPaths.map(path=>({path,sha256:hash(path)}))});
}
const manifestPath=`${dir}/sas-sql-gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:[source,journal,migration]});
const adoption={recordedAt:new Date().toISOString(),task:task.id,migration,canonicalGuardHash:hash(source),migrationHash:hash(migration),oldJournalEntriesRetained:true,old0010Unchanged:true,realNativeSqlAndExistingDataMigrationVerified:true,realFrontendHttpNativeSasMegolmVerified:true,historicalPassRowsUnchanged:true,mainApplied:false,productionActivation:false,frontendComplete:false,manifestPath};
fs.writeFileSync(`${dir}/sas-sql-adoption.json`,JSON.stringify(adoption,null,2)+'\n',{flag:'wx'});task.evidencePaths=[...new Set([...task.evidencePaths,...proofPaths,manifestPath,`${dir}/sas-sql-adoption.json`])];fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(adoption));
