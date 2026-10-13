import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function reviewRoomAuthority(dir,latestReport){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const adoption=JSON.parse(fs.readFileSync(`${dir}/room-membership-authority-adoption.json`));
 const source=JSON.parse(fs.readFileSync(`${dir}/room-membership-authority-source-review.json`));
 assert.equal(adoption.task,'CHATCRYPTO-BE');
 for(const flag of ['newSchema','newContract','mainMutation','backendPass','moderationProducerComplete'])assert.equal(adoption[flag],false);
 assert.equal(source.path,'apps/api/src/modules/rooms/rooms.service.ts');
 assert.equal(hash(`${dir}/room-membership-authority-source-review.json`),adoption.sourceReviewSha256);
 assert.equal(hash(source.beforeEvidence),source.beforeSha256);
 const prior=JSON.parse(fs.readFileSync(adoption.priorReviewEvidence));assert.equal(hash(adoption.priorReviewEvidence),adoption.priorReviewSha256);
 assert.equal(prior.sourceHashes[source.path],source.beforeSha256);
 const audit=JSON.parse(fs.readFileSync(`${dir}/codex-progress-audit-50.json`));assert.equal(hash(`${dir}/codex-progress-audit-50.json`),adoption.priorAuditRecordSha256);assert.equal(audit.exitCode,0);assert.equal(hash(audit.evidencePath),audit.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;
 const logged=fs.readFileSync(audit.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.deepEqual(logged.find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 assert.deepEqual(Object.keys(adoption.afterHashes),[source.path,'apps/api/test/chat-crypto-room-authority.integration.spec.ts']);
 for(const [p,digest]of Object.entries(adoption.afterHashes))assert.equal(hash(p),digest);
 let current=fs.readFileSync(source.path,'utf8'),index=current.indexOf('  async leaveOrRemoveMember(');assert(index>0);const prefix=current.slice(0,index);let tail=current.slice(index);
 assert.equal((tail.match(/BEGIN ISOLATION LEVEL READ COMMITTED/g)||[]).length,2);
 tail=tail.replaceAll('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');
 const final=/([ \t]*)await this\.checkActorSessionAndBan\(client, actorId, sessionId\);\n\1await client\.query\('COMMIT'\);/g;
 assert.equal([...tail.matchAll(final)].length,4);tail=tail.replace(final,"$1await client.query('COMMIT');");
 assert.equal(createHash('sha256').update(prefix+tail).digest('hex'),source.beforeSha256,'Only two owning isolation declarations and four final checks may change');
 assert.deepEqual(Object.keys(adoption.commands),['room-membership-authority-red-1','room-membership-authority-red-2','room-membership-authority-green-1','room-membership-authority-api-build-1']);
 for(const [label,digest]of Object.entries(adoption.commands)){
  const p=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(p));assert.equal(hash(p),digest);assert.equal(hash(record.evidencePath),record.evidenceSha256);assert.equal(record.exitCode,label.includes('-red-')?1:0);
  const log=fs.readFileSync(record.evidencePath,'utf8');
  if(label.endsWith('red-1'))assert(log.includes('column "admin_id" of relation "admin_actions" does not exist'),'Retain original fixture error separately');
  if(label.endsWith('red-2')){assert.match(log,/Tests:\s+12 failed,\s+12 total/);assert.equal((log.match(/Received value: undefined/g)||[]).length,12);assert(!log.includes('column "admin_id"'));}
  if(label.endsWith('green-1'))assert.match(log,/Tests:\s+12 passed,\s+12 total/);
 }
 assert.equal(latestReport[1],'custody-room-membership-authority-regression-1');
 return [source.beforeEvidence,adoption.priorReviewEvidence,`${dir}/room-membership-authority-source-review.json`,`${dir}/room-membership-authority-adoption.json`,`${dir}/room-membership-authority-review.md`,`${dir}/room-authority-review.mjs`,`${dir}/apply-room-authority.py`,`${dir}/adopt-room-authority.py`];
}
