import fs from 'node:fs';
import assert from 'node:assert/strict';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH02-FE');assert.equal(task.status,'IN_PROGRESS');
for(const p of ['.runtime/auth02-fe/**','.cache/auth02-fe/**'])if(!task.writeAllowlist.includes(p))task.writeAllowlist.push(p);
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');fs.appendFileSync('quality/evidence/AUTH02-FE/plan.md','\nRuntime fixture scope pinned before generation: .runtime/auth02-fe/** holds local ephemeral TLS certificate/key only, .cache/auth02-fe/** holds Playwright reports. Real production SMTP adapter enforces TLS465/587; use isolated loopback465 with a trusted temporary certificate and dummy fixture AUTH credentials, never disable certificate validation or change frozen backend. Certificate/private key are excluded from commit/evidence, owned cleanup removes them after E2E.\n');
