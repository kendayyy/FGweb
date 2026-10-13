import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-BE',scope=JSON.parse(fs.readFileSync(`${dir}/scope-legacy-cohort-uploads.json`)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,digest]of Object.entries(scope.priorHashes))if(!p.endsWith('_journal.json'))assert.equal(hash(p),digest,p);
const previous=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0018_snapshot.json')),current=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0019_snapshot.json'));
assert.deepEqual(Object.keys(current.tables).sort(),Object.keys(previous.tables).sort());
for(const [name,table]of Object.entries(previous.tables)){
 const after=structuredClone(current.tables[name]);if(name==='public.chat_crypto_upload_drafts'){
  assert.deepEqual(Object.keys(after.columns).filter(p=>!Object.hasOwn(table.columns,p)),['cohort_id']);assert.equal(after.columns.cohort_id.type,'text');assert.equal(after.columns.cohort_id.notNull,false);delete after.columns.cohort_id;
  const keys=Object.keys(after.foreignKeys).filter(p=>!Object.hasOwn(table.foreignKeys,p));assert.equal(keys.length,1);const fk=after.foreignKeys[keys[0]];assert.deepEqual(fk.columnsFrom,['cohort_id','conversation_id']);assert.deepEqual(fk.columnsTo,['id','conversation_id']);assert.equal(fk.tableTo,'chat_crypto_history_cohorts');assert.equal(fk.onDelete,'restrict');delete after.foreignKeys[keys[0]];
 }assert.deepEqual(after,table,name);
}
const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json'));assert.equal(journal.entries.length,20);assert.equal(createHash('sha256').update(JSON.stringify({...journal,entries:journal.entries.slice(0,19)},null,2)).digest('hex'),scope.priorHashes['packages/database/migrations/meta/_journal.json']);
const sql=fs.readFileSync('packages/database/migrations/0019_chat_crypto_cohort_uploads.sql','utf8');const statements=sql.split('--> statement-breakpoint');assert.equal(statements.length,2);for(const statement of statements)assert(/^\s*ALTER TABLE "chat_crypto_upload_drafts" ADD (COLUMN "cohort_id" text|CONSTRAINT )/.test(statement));assert(!/^\s*(CREATE TABLE|DROP|UPDATE|DELETE)\b/im.test(sql));
const result={recordedAt:new Date().toISOString(),priorSqlSnapshotsUnchanged:true,priorJournalPrefixUnchanged:true,onlyNullableDraftCohortAndCompositeForeignKey:true,allOtherTableDefinitionsUnchanged:true,mainMigration:false};fs.writeFileSync(`${dir}/legacy-cohort-uploads-prerequisite-review.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
