import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function reviewAdmissionAuthority(dir,latestReport){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const adoption=JSON.parse(fs.readFileSync(`${dir}/admission-recipient-authority-adoption.json`));
 const source=JSON.parse(fs.readFileSync(`${dir}/admission-recipient-authority-source-review.json`));
 assert.equal(adoption.task,'CHATCRYPTO-BE');for(const flag of ['newSchema','newContract','mainMutation','backendPass','moderationProducerComplete'])assert.equal(adoption[flag],false);
 assert.deepEqual(source.paths,['apps/api/src/modules/teams/teams.service.ts','apps/api/src/modules/invitations/invitations.service.ts']);assert.equal(hash(`${dir}/admission-recipient-authority-source-review.json`),adoption.sourceReviewSha256);
 const prior=JSON.parse(fs.readFileSync(adoption.priorReviewEvidence));assert.equal(hash(adoption.priorReviewEvidence),adoption.priorReviewSha256);
 const auditPath=`${dir}/codex-progress-audit-51.json`,audit=JSON.parse(fs.readFileSync(auditPath));assert.equal(hash(auditPath),adoption.priorAuditRecordSha256);assert.equal(audit.exitCode,0);assert.equal(hash(audit.evidencePath),audit.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;const logged=fs.readFileSync(audit.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.deepEqual(logged.find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 assert.deepEqual(Object.keys(adoption.afterHashes),[...source.paths,'apps/api/test/chat-crypto-admission-authority.integration.spec.ts']);for(const [p,digest]of Object.entries(adoption.afterHashes))assert.equal(hash(p),digest);
 for(const p of source.paths)assert.equal(prior.sourceHashes[p],source.beforeHashes[p]);
 const remove=(text,change,previous='')=>{assert.equal(text.split(change).length,2,'Exactly one intended source boundary');return text.replace(change,previous);};
 let teams=fs.readFileSync(source.paths[0],'utf8');teams=remove(teams,"await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');","await db.query('BEGIN');");teams=remove(teams,'  await this.eligible(db,userId);\n');teams=remove(teams,"  if(action==='ACCEPT')await this.eligible(db,j.applicant_id);\n");assert.equal(createHash('sha256').update(teams).digest('hex'),source.beforeHashes[source.paths[0]]);
 let invitations=fs.readFileSync(source.paths[1],'utf8');invitations=remove(invitations,'    await this.eligible(db, i.sender_id); await this.eligible(db, i.receiver_id);\n');invitations=remove(invitations,"      await this.actor(db, actor, session);\n      if(action==='ACCEPT')await this.eligible(db, i.sender_id);\n      return this.dto(await this.invite(db, id));","      await this.actor(db, actor, session); return this.dto(await this.invite(db, id));");invitations=remove(invitations,"      if(action==='ACCEPT'){await this.eligible(db, i.sender_id);await this.eligible(db, i.receiver_id);}\n");assert.equal(createHash('sha256').update(invitations).digest('hex'),source.beforeHashes[source.paths[1]]);
 const roomPath=`${dir}/room-authority-review.mjs`;assert.equal(hash(adoption.priorRoomGuardEvidence),adoption.priorRoomGuardSha256);assert.equal(prior.sourceHashes[roomPath],adoption.priorRoomGuardSha256);assert.equal(hash(roomPath),adoption.afterRoomGuardSha256);
 const room=remove(fs.readFileSync(roomPath,'utf8'),"fs.existsSync(`${dir}/admission-recipient-authority-adoption.json`)?'custody-admission-recipient-authority-regression-1':'custody-room-membership-authority-regression-1'","'custody-room-membership-authority-regression-1'");assert.equal(createHash('sha256').update(room).digest('hex'),adoption.priorRoomGuardSha256);
 assert.deepEqual(Object.keys(adoption.commands),['admission-recipient-authority-red-1','admission-recipient-authority-green-1','admission-recipient-authority-red-2','admission-recipient-authority-green-2','admission-recipient-authority-api-build-1']);
 for(const [label,digest]of Object.entries(adoption.commands)){
  const p=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(p)),log=fs.readFileSync(record.evidencePath,'utf8');assert.equal(hash(p),digest);assert.equal(hash(record.evidencePath),record.evidenceSha256);assert.equal(record.exitCode,label.includes('-red-')?1:0);
  if(label.endsWith('red-1')){assert.match(log,/Tests:\s+6 failed,\s+6 total/);assert.equal((log.match(/Received: 201/g)||[]).length,6);}
  if(label.endsWith('green-1'))assert.match(log,/Tests:\s+6 passed,\s+6 total/);
  if(label.endsWith('red-2')){assert.match(log,/Tests:\s+8 failed,\s+8 passed,\s+16 total/);assert.equal((log.match(/Received: 201/g)||[]).length,6);assert.equal((log.match(/Received: 200/g)||[]).length,2);}
  if(label.endsWith('green-2'))assert.match(log,/Tests:\s+16 passed,\s+16 total/);
 }
 assert.equal(latestReport[1],'custody-admission-recipient-authority-regression-1');
 return [adoption.priorReviewEvidence,adoption.priorRoomGuardEvidence,`${dir}/admission-recipient-authority-source-review.json`,`${dir}/admission-recipient-authority-adoption.json`,`${dir}/admission-recipient-authority-review.md`,`${dir}/admission-authority-review.mjs`,`${dir}/adopt-admission-authority.py`];
}
