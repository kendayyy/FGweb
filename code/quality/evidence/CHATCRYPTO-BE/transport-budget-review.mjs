import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function reviewTransportBudget(dir){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const adoption=read(`${dir}/transport-budget-adoption.json`),prior=read(`${dir}/transit-rejection-prior-review.json`),source='apps/api/src/modules/chat-crypto/crypto-relay.service.ts';
 assert.equal(adoption.task,'CHATCRYPTO-BE');assert.equal(adoption.backendComplete,false);assert.equal(adoption.mainMutation,false);assert.equal(adoption.productionCeilingsApproved,false);assert.equal(adoption.optionalPreferenceAnswered,false);
 assert.equal(hash(`${dir}/transit-rejection-prior-review.json`),adoption.priorReviewSha256);
 assert.equal(hash(`${dir}/transport-budget-before-relay.ts`),prior.sourceHashes[source]);
 const lines=fs.readFileSync(source,'utf8').split('\n'),removed=lines.filter(line=>line.includes('crypto-transport-budget.js')||line.includes('await lockCryptoTransportBudget(')||line.includes('await enforceCryptoTransportBudget('));assert.equal(removed.length,5);
 assert.equal(createHash('sha256').update(lines.filter(line=>!removed.includes(line)).join('\n')).digest('hex'),prior.sourceHashes[source]);
 for(const [p,h]of Object.entries(adoption.afterHashes))assert.equal(hash(p),h);
 const expected=[['transport-budget-red-1',1],['transport-budget-green-1',1],['transport-budget-green-2',0],['transport-budget-boundary-1',1],['transport-budget-boundary-2',1],['transport-budget-boundary-3',1],['transport-budget-boundary-4',0],['transport-budget-api-build-1',0],['transport-budget-regression-1',1],['transport-budget-regression-2',0],['transport-budget-scoped-regression-1',0],['transport-budget-stock-1',0]];
 for(const [label,exitCode]of expected){const file=`${dir}/codex-${label}.json`,record=read(file);assert.equal(hash(file),adoption.commands[label]);assert.equal(record.exitCode,exitCode);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
 assert.match(fs.readFileSync(`${dir}/codex-transport-budget-red-1.txt`,'utf8'),/Tests:\s+6 failed,\s+1 passed,\s+7 total/);
 assert.match(fs.readFileSync(`${dir}/codex-transport-budget-boundary-4.txt`,'utf8'),/Tests:\s+15 passed,\s+15 total/);
 const scoped=fs.readFileSync(`${dir}/codex-transport-budget-scoped-regression-1.txt`,'utf8');assert.match(scoped,/Tests:\s+28 passed,\s+28 total/);assert.match(scoped,/Test Suites:\s+4 passed,\s+4 total/);
 const record=read(`${dir}/codex-transport-budget-regression-2.json`),log=fs.readFileSync(record.evidencePath,'utf8');assert.match(log,/Tests:\s+301 passed,\s+301 total/);assert.match(log,/Test Suites:\s+17 passed,\s+17 total/);
 const nativePath=`${dir}/report-regression-custody-transport-budget-2-result.json`,native=read(nativePath);assert.equal(hash(nativePath),adoption.nativeSha256);
 const {recordedAt,...summary}=native;assert.deepEqual(summary,JSON.parse(log.trim().split(/\r?\n/).at(-1)));assert(Date.parse(recordedAt)>=Date.parse(record.startedAt)&&Date.parse(recordedAt)<=Date.parse(record.completedAt));
 for(const flag of ['tlsVerified','untrustedTlsDenied','transitRoundtrip','tamperDenied','keyExportDenied','operatorRotationRewrap','restartPersistence','sealedDenied','outageDenied','appRoleSecretRevocation','auditPlaintextAbsent','backupKeySeparation','reportHttpNative','ownedBackupRestore','fixtureTokenLiveBeforePost','fixtureSecretLiveBeforeRevocation','fixtureTokenLiveBeforeRevocation','adapterRevokedTokenDenied','cleanup'])assert.equal(native[flag],true,flag);
 for(const flag of ['mainDatabaseChanged','mainEnvironmentChanged','productionReady'])assert.equal(native[flag],false);
 assert.equal(hash(`${dir}/report-native.mjs`),prior.sourceHashes[`${dir}/report-native.mjs`]);
 const transitions={[source]:{before:prior.sourceHashes[source],after:hash(source)}};
 const guard=`${dir}/transport-budget-expiry-backlog-review.mjs`,oldGuard=`${dir}/transport-budget-prior-expiry-backlog-review.mjs`,originalPath=`${dir}/expiry-backlog-review.mjs`;
 assert.equal(hash(oldGuard),prior.sourceHashes[originalPath]);assert.equal(hash(originalPath),hash(oldGuard));
 const guarded="for(const [p,digest]of Object.entries(source.readonlySourceHashes)){if(transitions[p])assert.equal(transitions[p].before,digest);assert.equal(hash(p),transitions[p]?.after??digest);assert.equal(prior.sourceHashes[p],digest);}";
 const original="for(const [p,digest]of Object.entries(source.readonlySourceHashes)){assert.equal(hash(p),digest);assert.equal(prior.sourceHashes[p],digest);}";
 const guardText=fs.readFileSync(guard,'utf8');assert.equal(guardText.split(guarded).length,2);assert.equal(createHash('sha256').update(guardText.replace(guarded,original)).digest('hex'),hash(oldGuard));
 const windows=['transit-rejection-regression-1','transport-budget-regression-2'].map(label=>read(`${dir}/codex-${label}.json`));
 for(const [p,pin]of Object.entries(adoption.appendOnlyJournals)){
  assert.equal(pin.beforeSha256,prior.sourceHashes[p]);assert.equal(hash(p),pin.afterSha256);
  const bytes=fs.readFileSync(p);assert.equal(hash(pin.prefixPath),pin.beforeSha256);assert(bytes.subarray(0,pin.prefixBytes).equals(fs.readFileSync(pin.prefixPath)));
  const appended=bytes.subarray(pin.prefixBytes).toString('utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(appended.length,pin.appendedRecords);
  for(const row of appended){const time=row.startedAt??row.recordedAt;if(time)assert(windows.some(window=>Date.parse(time)>=Date.parse(window.startedAt)&&Date.parse(row.completedAt??time)<=Date.parse(window.completedAt)));if(row.schema)assert.match(row.schema,/^crypto_be_[a-f0-9]{32}$/);if(Object.hasOwn(row,'clientKeysIncluded')){assert.equal(row.clientKeysIncluded,false);assert.equal(row.custodyKeysIncluded,false);}}
  transitions[p]={before:pin.beforeSha256,after:pin.afterSha256};
 }
 return {transitions,paths:[...Object.keys(adoption.afterHashes),oldGuard,...Object.keys(adoption.appendOnlyJournals),...Object.values(adoption.appendOnlyJournals).map(pin=>pin.prefixPath),nativePath,`${dir}/transport-budget-adoption.json`,`${dir}/transport-budget-review.mjs`,`${dir}/transport-budget-plan.md`,`${dir}/transport-budget-before-relay.ts`,`${dir}/transport-budget-reconstruction.json`]};
}
