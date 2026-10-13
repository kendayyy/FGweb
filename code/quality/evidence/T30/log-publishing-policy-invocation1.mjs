import fs from 'node:fs';
import assert from 'node:assert/strict';
const invocation=JSON.parse(fs.readFileSync('quality/evidence/T30/antigravity-publishing-fresh-policy-invocation.json','utf8'));
assert.equal(invocation.requestedModel,'Gemini 3.6 Flash (High)');
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — publishing fresh policy proposal invocation '+invocation.startedAt+': same fixed model/conversation, isolated evidence files only. Narrow final publishing peer-loop fresh combined lease/policy at existing checkpoint; shared original permission comparison through private helper and unchanged original syncNativePermissions path. No admission batching/native outside locks/cache/timeouts/pool/assertion changes. Actual real-DB behavioral RED and parity/revocation/slot cleanup/prototype restoration needed before source adoption. Evidence code/quality/evidence/T30/antigravity-publishing-fresh-policy-invocation.json; T30 IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n');
console.log('Invocation history recorded; source adoption pending review.');
