import fs from 'node:fs'; import assert from 'node:assert/strict'; import { createHash } from 'node:crypto';
const dir = 'quality/evidence/CHATCRYPTO-FE';
const paths = ['packages/contracts/src/chat-crypto.ts','packages/contracts/dist/chat-crypto.js','packages/contracts/dist/chat-crypto.d.ts','apps/api/src/modules/chat-crypto/crypto-relay.service.ts','apps/api/dist/modules/chat-crypto/crypto-relay.service.js','apps/api/dist/modules/chat-crypto/crypto-relay.service.js.map','apps/api/dist/modules/chat-crypto/crypto-relay.service.d.ts'];
const digest = x => createHash('sha256').update(x).digest('hex');
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json','utf8')); assert.equal(ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE').status,'IN_PROGRESS');
const files = Object.fromEntries(paths.map((file,index)=>{ const bytes=fs.readFileSync(file); fs.writeFileSync(`${dir}/legacy-context-original-${index}.txt`,bytes,{flag:'wx'});return [file,digest(bytes)]; }));
fs.writeFileSync(`${dir}/legacy-context-before.json`,JSON.stringify({recordedAt:new Date().toISOString(),files,rows:Object.fromEntries(ledger.tasks.map(row=>[row.id,digest(JSON.stringify(row))]))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({capturedPaths:paths.length,historicalRowsPreserved:true}));
