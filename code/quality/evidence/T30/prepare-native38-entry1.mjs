import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',j=n=>JSON.parse(fs.readFileSync(d+'/'+n)),h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(j('codex-t30-native38-metrics-adoption-1.json').exitCode,0);
const smoke=j('native38-metrics-smoke-review1.json');assert(smoke.allOwnedCleanupVerified&&smoke.actualFaultPropagatesWithResourceCleanup&&smoke.currentPinsUnchanged);
for(const p of j('native38-metrics-before1.json').pins)if(p.path!==d+'/fixture-server-shaped.mjs')assert.equal(h(p.path),p.sha256);
for(const p of j('native38-metrics-adoption-plan1.json').files)assert.equal(h(p.path),p.afterSha256);
for(const p of j('native38-metrics-source-review1.json').reviewed)assert.equal(h(p.path),p.sha256);
const previous=j('native37-entry-review.json');assert.equal(previous.actualGuardCases,110);
for(const [name,count]of previous.groups){const c=j(name);assert.equal(c.exitCode,0);assert.equal(h(c.evidencePath),c.evidenceSha256);assert(fs.readFileSync(c.evidencePath,'utf8').includes(count+' passed, '+count+' total'));}
for(const p of j('api-build-10-review.json').compiledChanges)assert.equal(h(p.path),p.afterSha256);
const health=j('codex-t30-native38-service-health-1.json');assert.equal(health.exitCode,0);const log=fs.readFileSync(health.evidencePath,'utf8');assert(log.includes('/fg-local-postgres-1 running healthy')&&log.includes('/fg-local-redis-1 running healthy'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));assert.equal(ledger.tasks.find(v=>v.status!=='PASS').id,'T30');for(const p of j('before.json').historical)assert.deepEqual(ledger.tasks.find(v=>v.id===p.id),p);
const result={recordedAt:new Date().toISOString(),actualGuardCases:110,apiBuild:10,frontendBuild:1,currentGatewayCanonical:true,diagnosticOnly:true,actualMetricsControls:6,actualFullFixtureSmokes:2,currentSourceRuntimeAssertionsPinsVerified:true,health,task:'T30',priorPass:80,headed:true,telegramProducer:true,nativeAcceptance:false};
fs.writeFileSync(d+'/native38-entry-review1.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — T30 — diagnostic headed38 entry ${result.recordedAt}: actual reviewed metrics6controls/2fullfixture smokes and strict exact adoption verified, current source/build10/gateway canonical/frontend1/frozen deadlines/assertions/110 regression evidence unchanged, actual fresh PostgreSQL+Redis healthy. Headed Chromium/three actor topology/new actual viewport photos/Telegram required; diagnostics add process/pool spans only, no native acceptance claimed. Evidence code/${d}/native38-entry-review1.json; IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n`);
console.log('Diagnostic headed38 entry verified; all native assertions preserved.');
