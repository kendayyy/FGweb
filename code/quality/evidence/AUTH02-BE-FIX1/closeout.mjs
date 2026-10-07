import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/AUTH02-BE-FIX1',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const commands=['gate-1','regression-1','build-1','test-types-1','lint-2','audit-2','diff-2'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of commands){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-red-1.json`)).exitCode,1);
assert(fs.readFileSync(`${dir}/codex-red-1.txt`,'utf8').includes('Received: "/api/auth/verify-email"'));
assert(fs.readFileSync(`${dir}/codex-regression-1.txt`,'utf8').includes('231 passed'));
fs.writeFileSync(`${dir}/review.md`,'# AUTH02-BE-FIX1 — Codex review PASS\n\nGenuine RED reproduced old native API mail link; new mailed verification URL opens same-origin FG /auth/verify with only the signed, nonce-protected token. The existing frozen API contract consumes it through GET /api/auth/verify-email without callback and produces validated JSON success, replay/expiry errors without redirects. New real HTTP/PG/SMTP case proves the link, no auto session, single use and expiry; all prior14 auth security cases retained and the full API suite has231 PASS. Old API-only mail consumer helper now translates the web link to the native endpoint, retaining original302/400 and all security assertions. SMTP test receiver correctly removes dot transparency before decoding; no production mail transport changes.\n\nStrict unmodified task gate PASS after byte-exact backup and restoration of7 historical frontend outputs; pending FE WIP backup hashes remain intact. Seven-source baseline, frozen output/evidence audit, compiled API build, test types, lint and diff check PASS. Production diff limited to verification mail URL, no contracts/database/dependencies/security policy changes; historical AUTH02-BE evidence preserved. External provider delivery and human receipt evidence remain original AUTH02-BE; the revised URL has real local transport proof and is followed by headed AUTH02-FE E2E. No extra external email sent.\n');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify({task:'AUTH02-BE-FIX1',commands,apiTests:231,newIntegrationCases:1,initialRedFailures:1,strictGatePassed:true,frozenFrontendWipPreserved:true,contractsAndSecurityPolicyUnchanged:true},null,2)+'\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH02-BE-FIX1');assert.equal(task.status,'IN_PROGRESS');
const evidence=walk(dir),outputs=['apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-email.integration.spec.ts',...walk('apps/api/dist'),...evidence];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands,evidencePaths:evidence,outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(f=>[f,hash(f)]))}});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Auth verification mail opens FG UI; native JSON consume/replay/expiry preserved | AUTH02-BE-FIX1 |1 RED;new real HTTP/PG/SMTP case;231 API PASS;strict gate/build/types/lint/frozen audit | PASS producer;UI resumes AUTH02-FE |\n');
console.log('AUTH02-BE-FIX1 PASS. AUTH02-FE remains suspended until strict resume gate.');
