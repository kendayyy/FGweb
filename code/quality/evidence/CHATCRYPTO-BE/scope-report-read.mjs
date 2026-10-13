import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-BE',ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE');
assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
const paths=['packages/contracts/test/chat-crypto-report-read.test.ts','packages/database/src/schema/chat-crypto-report-audit.ts','packages/database/migrations/0015_chat_crypto_report_audit.sql','packages/database/migrations/meta/0015_snapshot.json','packages/database/dist/schema/chat-crypto-report-audit.js','packages/database/dist/schema/chat-crypto-report-audit.d.ts'];
for(const p of paths){assert(!Object.hasOwn(before.readonly,p));if(p!==paths[0])assert(!fs.existsSync(p));assert(!task.writeAllowlist.includes(p));}
const priorPaths=fs.readdirSync('packages/database/migrations').filter(p=>p.endsWith('.sql')).map(p=>'packages/database/migrations/'+p).concat(fs.readdirSync('packages/database/migrations/meta').map(p=>'packages/database/migrations/meta/'+p));
const priorHashes=Object.fromEntries(priorPaths.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const amendment={adoptedAt:new Date().toISOString(),source:'Persisted human Permission to broaden Write Scope or touch locked files',paths,beforeSha256:{},priorHashes,evidence:`${dir}/scope-report-read.json`,reason:'Additive admin report-reader contracts and audit prerequisite in current BE owner. Already-owned contract/database index and journal remain same owner. Preserve prior migrations/PASS/checker/main DB.'};
fs.writeFileSync(amendment.evidence,JSON.stringify(amendment,null,2)+'\n',{flag:'wx'});task.writeAllowlist.push(...paths);task.approvedScopeAmendments.push(amendment);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({task:task.id,status:task.status,pinned:paths.length,historicalPASS:before.historical.length}));
