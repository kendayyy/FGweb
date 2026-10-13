import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-BE',scope=JSON.parse(fs.readFileSync(`${dir}/scope-expiry-indexes.json`)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,digest]of Object.entries(scope.priorHashes))if(!p.endsWith('_journal.json'))assert.equal(hash(p),digest,p);
const prior=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0020_snapshot.json')),current=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0021_snapshot.json'));
const permitted={'public.chat_crypto_to_device_events':'chat_crypto_to_device_expiry_idx','public.chat_crypto_protocol_events':'chat_crypto_protocol_expiry_idx'};
assert.deepEqual(Object.keys(current.tables),Object.keys(prior.tables));
for(const [name,table]of Object.entries(prior.tables)){const after=structuredClone(current.tables[name]);if(permitted[name]){const extra=Object.keys(after.indexes).filter(k=>!Object.hasOwn(table.indexes,k));assert.deepEqual(extra,[permitted[name]]);const added=after.indexes[extra[0]];assert.equal(added.method,'btree');assert.equal(added.isUnique,false);assert.deepEqual(added.columns.map(c=>c.expression),['expires_at','id']);assert(!added.where);delete after.indexes[extra[0]];}assert.deepEqual(after,table,name);}
for(const field of ['enums','schemas','sequences','roles','policies','views'])assert.deepEqual(current[field],prior[field]);
const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json'));assert.equal(journal.entries.length,22);assert.equal(hash('packages/database/migrations/meta/0020_snapshot.json'),scope.priorHashes['packages/database/migrations/meta/0020_snapshot.json']);assert.equal(createHash('sha256').update(JSON.stringify({...journal,entries:journal.entries.slice(0,21)},null,2)).digest('hex'),scope.priorHashes['packages/database/migrations/meta/_journal.json']);
const file='packages/database/migrations/0021_chat_crypto_expiry_indexes.sql',statements=fs.readFileSync(file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
assert.deepEqual(statements,['CREATE INDEX "chat_crypto_to_device_expiry_idx" ON "chat_crypto_to_device_events" USING btree ("expires_at","id");','CREATE INDEX "chat_crypto_protocol_expiry_idx" ON "chat_crypto_protocol_events" USING btree ("expires_at","id");']);
const result={recordedAt:new Date().toISOString(),priorSqlSnapshotsUnchanged:true,priorJournalPrefixUnchanged:true,onlyTwoExpiryIndexes:true,allOtherDefinitionsUnchanged:true,reviewedSqlSha256:hash(file),mainMigration:false,backendPass:false};fs.writeFileSync(`${dir}/expiry-prerequisite-review.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
