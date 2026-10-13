import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),scope=JSON.parse(fs.readFileSync('quality/evidence/CHATCRYPTO-BE/scope-report-read.json'));
const journalPath='packages/database/migrations/meta/_journal.json',journal=JSON.parse(fs.readFileSync(journalPath)),prefix=JSON.stringify({...journal,entries:journal.entries.slice(0,-1)},null,2);
assert.equal(journal.entries.length,16);assert.equal(journal.entries.at(-1).tag,'0015_chat_crypto_report_audit');assert([prefix,prefix+'\n'].some(s=>createHash('sha256').update(s).digest('hex')===scope.priorHashes[journalPath]));
for(const [p,digest]of Object.entries(scope.priorHashes))if(p!==journalPath)assert.equal(hash(p),digest,p);
const prior=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0014_snapshot.json')),next=JSON.parse(fs.readFileSync('packages/database/migrations/meta/0015_snapshot.json'));assert.equal(next.prevId,prior.id);assert.equal(Object.keys(next.tables).length,Object.keys(prior.tables).length+1);for(const [name,table]of Object.entries(prior.tables))assert.deepEqual(next.tables[name],table,name);for(const key of ['enums','schemas','sequences','roles','policies','views'])assert.deepEqual(next[key],prior[key]);assert(!fs.readFileSync('packages/database/migrations/0015_chat_crypto_report_audit.sql','utf8').includes('"public".'));
console.log(JSON.stringify({journalEntries:16,prior15EntryPrefixUnchanged:true,priorMigrationsSnapshotsUnchanged:true,priorTableDefinitionsUnchanged:true,onlyAdditiveAuditTable:true,mainMigration:false}));
