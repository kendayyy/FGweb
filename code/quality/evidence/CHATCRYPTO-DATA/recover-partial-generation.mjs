import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=fs.realpathSync('.'),source='packages/database/migrations/meta/0013_snapshot.json',target='.runtime/chatcrypto-data/partial-0013-snapshot.json';
const journal=JSON.parse(fs.readFileSync('packages/database/migrations/meta/_journal.json','utf8'));
assert.equal(journal.entries.at(-1).idx,12);assert(!fs.readdirSync('packages/database/migrations').some(f=>f.startsWith('0013_')));assert(!fs.existsSync(target));
assert(fs.realpathSync(source).startsWith(root+'\\'));const digest=createHash('sha256').update(fs.readFileSync(source)).digest('hex');fs.renameSync(source,target);
fs.writeFileSync('quality/evidence/CHATCRYPTO-DATA/partial-generation-recovery.json',JSON.stringify({recordedAt:new Date().toISOString(),source,target,sha256:digest,cause:'Generator wrote snapshot but failed journal write and misleadingly exited zero',journalLastIndex:12,mainDatabaseMigrated:false},null,2)+'\n');
console.log('Preserved owned partial snapshot; journal through 0012 untouched, retry generator.');
