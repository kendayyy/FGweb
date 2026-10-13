import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-BE',scope=JSON.parse(fs.readFileSync(`${dir}/scope-legacy-stages.json`)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,digest]of Object.entries(scope.priorHashes))if(!p.endsWith('_journal.json'))assert.equal(hash(p),digest,p);
const prior=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0019_snapshot.json')),current=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0020_snapshot.json'));
assert.deepEqual(Object.keys(current.tables).filter(k=>!Object.hasOwn(prior.tables,k)).sort(),['public.chat_crypto_legacy_stage_objects','public.chat_crypto_legacy_stage_sources','public.chat_crypto_legacy_stages']);
const permitted={'public.chat_crypto_legacy_candidates':'crypto_legacy_candidate_stage_binding_unique','public.chat_crypto_legacy_candidate_images':'crypto_legacy_image_stage_binding_unique'};
for(const [name,table]of Object.entries(prior.tables)){
 const after=structuredClone(current.tables[name]);if(permitted[name]){const extra=Object.keys(after.uniqueConstraints).filter(k=>!Object.hasOwn(table.uniqueConstraints,k));assert.deepEqual(extra,[permitted[name]]);delete after.uniqueConstraints[extra[0]];}assert.deepEqual(after,table,name);
}
const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json'));assert.equal(journal.entries.length,21);assert.equal(createHash('sha256').update(JSON.stringify({...journal,entries:journal.entries.slice(0,20)},null,2)).digest('hex'),scope.priorHashes['packages/database/migrations/meta/_journal.json']);
const file='packages/database/migrations/0020_chat_crypto_legacy_stages.sql',generated=fs.readFileSync(file,'utf8'),statements=generated.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
assert(!/\b(DROP|UPDATE|DELETE|TRUNCATE)\s+(TABLE|FROM|chat_|"chat_)/i.test(generated));
const oldUnique=statements.filter(s=>/^ALTER TABLE "chat_crypto_legacy_(candidates|candidate_images)" ADD CONSTRAINT/.test(s));assert.equal(oldUnique.length,2);for(const s of oldUnique)assert(/ UNIQUE\(/.test(s));
for(const s of statements)assert(/^(CREATE TABLE "chat_crypto_legacy_stage|ALTER TABLE "chat_crypto_legacy_stage|CREATE INDEX "crypto_legacy_stage)/.test(s)||oldUnique.includes(s));
// Drizzle emits the redundant old-table unique keys after new FKs. Install
// exactly those unchanged keys first. Unqualify only generated public FK targets
// so disposable isolated schemas and the real search_path share identical DDL.
const ordered=[...statements.filter(s=>s.startsWith('CREATE TABLE ')),...oldUnique,...statements.filter(s=>!s.startsWith('CREATE TABLE ')&&!oldUnique.includes(s))];
const normalized=ordered.join('--> statement-breakpoint\n').replaceAll('REFERENCES "public".','REFERENCES ');
fs.writeFileSync(file,normalized+'\n');
const result={recordedAt:new Date().toISOString(),priorSqlSnapshotsUnchanged:true,priorJournalPrefixUnchanged:true,onlyThreeStageTablesAndTwoCompositeUniqueKeys:true,allOtherTableDefinitionsUnchanged:true,generatedSqlSha256:createHash('sha256').update(generated).digest('hex'),reviewedSqlSha256:hash(file),onlyUniqueBeforeForeignKeyOrderAndPublicTargetQualificationChanged:true,mainMigration:false,sourceConversion:false};
fs.writeFileSync(`${dir}/legacy-stages-prerequisite-review.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
