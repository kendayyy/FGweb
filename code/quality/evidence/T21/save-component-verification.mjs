import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T21',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const records=['feature-final-3','frontend-regression-3','types-final-2','lint-final-2','audit-final-2','gate-1'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of records){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-feature-final-3.txt`,'utf8').includes('26 passed'));
assert(fs.readFileSync(`${dir}/codex-frontend-regression-3.txt`,'utf8').includes('130 passed'));
const p='quality/tasks.json',l=JSON.parse(fs.readFileSync(p)),t=l.tasks.find(t=>t.id==='T21');assert.equal(t.status,'IN_PROGRESS');
Object.assign(t,{status:'BLOCKED',blockers:['Approve minimal additional write scope apps/web/src/features/lobby/LobbyPage.tsx (import RecruitmentPanel and replace frozen placeholder only), then integrated build/browser verification'],commands:records,evidencePaths:records.map(r=>r.evidencePath).concat([`${dir}/wiring-proposal.md`,`${dir}/LobbyPage.proposed.tsx`,`${dir}/component-review.md`,`${dir}/component-verification.json`])});
fs.writeFileSync(`${dir}/component-verification.json`,JSON.stringify({task:'T21',status:'BLOCKED',componentTests:26,frontendRegressionTests:130,checks:records,productionLobbyWiringApplied:false,productionBrowserVerified:false,taskPass:false,lobbyFrozenSha256:hash('apps/web/src/features/lobby/LobbyPage.tsx'),specSha256:hash('../.doc/01-product-spec.md'),executor:'Codex direct; Anti2 paused'},null,2)+'\n');
fs.writeFileSync(p,JSON.stringify(l,null,2)+'\n');
const f=`${dir}/wiring-proposal.md`;fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('Feature unit tests will be run within the original scope before requesting approval.','Component and form are implemented and reviewed within original scope:26 feature tests and130 frontend regression tests PASS; strict source/new-test types, changed-source/test lint and scope/frozen/spec/secrets audit PASS.'));
fs.appendFileSync(`${dir}/component-review.md`,'\nFinal pre-wiring verification:26 feature tests and130 full frontend tests PASS; types/lint/scope audit PASS. T21 BLOCKED solely on minimal frozen LobbyPage write-scope approval and its subsequent integrated build/browser checks. All commands, failures and original assertions preserved.\n');
console.log('T21 component verified; task BLOCKED, not PASS, pending exact Lobby wiring approval.');
