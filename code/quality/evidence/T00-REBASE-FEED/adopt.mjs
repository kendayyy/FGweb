import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T00-REBASE-FEED',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const baseline=JSON.parse(fs.readFileSync(`${dir}/previous-baseline.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
for(const name of ['01-product-spec.md','02-frontend-design.md','task.md'])assert.equal(hash(`../.doc/${name}`),hash(`${dir}/${name}`),'Requirement source changed while adopting; review new diff first');
const hashes={specSha256:hash('../.doc/01-product-spec.md'),designSha256:hash('../.doc/02-frontend-design.md'),taskSha256:hash('../.doc/task.md'),mockupLobbySha256:hash('../.doc/mockups/01-lobby-desktop-mobile.png'),mockupCallSha256:hash('../.doc/mockups/02-group-call-live.png'),mockupFeedSha256:hash('../.doc/mockups/03-community-feed-desktop-mobile.png')};
for(const key of ['mockupLobbySha256','mockupCallSha256'])assert.equal(hashes[key],baseline.hashes[key].toLowerCase());
baseline.amendments.push({id:'FEED-CHANGE-01',date:'2026-10-07',userInstruction:'bố cục ổn đó ghi vào các tài liệu để bên task coding và build làm',authorization:`${dir}/authorization.json`,previousHashes:baseline.hashes,hashes,evidence:`${dir}/review.md`,affectedTasks:['T38-FEED-DATA','T38-FEED-BE','T38-FEED-FE','T39','T40','T41','T42']});
baseline.hashes=hashes;baseline.additionalRequirements={...(baseline.additionalRequirements??{}),'FEED-CHANGE-01':{specSection:13,designSection:10,executionStatus:'NOT_STARTED',checkpointOrder:['T38-FEED-DATA','T38-FEED-BE','T38-FEED-FE'],implementationBefore:'T39'}};
fs.writeFileSync('quality/spec-baseline.json',JSON.stringify(baseline,null,2)+'\n');
for(const task of ledger.tasks){if(task.specSha256.toLowerCase()!==hashes.specSha256){task.baselineAdoptions=[...(task.baselineAdoptions??[]),{previousSpecSha256:task.specSha256,newSpecSha256:hashes.specSha256,reviewTask:'T00-REBASE-FEED',scopeImpact:task.status==='PASS'?'Existing task scope preserved; new feed work not covered by historic PASS':'Use amended requirements and future checkpoint order'}];task.specSha256=hashes.specSha256;}}
const empty={status:'NOT_STARTED',specSha256:hashes.specSha256,inputsHash:null,outputsHash:null,commands:[],evidencePaths:[],startedAt:null,completedAt:null,blockers:[]};
const tasks=[
 {...empty,id:'T38-FEED-DATA',dependencies:['T38'],writeAllowlist:['packages/contracts/src/feed.ts','packages/contracts/src/moderation.ts','packages/contracts/src/index.ts','packages/contracts/test/feed.test.ts','packages/contracts/dist/**','packages/database/src/schema/feed.ts','packages/database/src/schema/moderation.ts','packages/database/src/index.ts','packages/database/migrations/**','packages/database/test/feed.test.ts','packages/database/dist/**','quality/api-contract.md','quality/evidence/T38-FEED-DATA/**']},
 {...empty,id:'T38-FEED-BE',dependencies:['T38-FEED-DATA'],writeAllowlist:['apps/api/src/modules/feed/**','apps/api/src/app.module.ts','apps/api/src/modules/uploads/**','apps/api/src/modules/moderation/**','apps/api/test/feed.integration.spec.ts','apps/api/test/feed-assets.integration.spec.ts','quality/api-contract.md','quality/evidence/T38-FEED-BE/**']},
 {...empty,id:'T38-FEED-FE',dependencies:['T38-FEED-BE'],writeAllowlist:['apps/web/src/features/feed/**','apps/web/test/feed.test.tsx','tests/e2e/feed.spec.ts','quality/evidence/T38-FEED-FE/**'],scopePreparationRequired:'Before task preflight record exact router/shell/navigation/upload/social/moderation integration files within the approved task.md scope; no broad web-src wildcard'}
];
assert(!ledger.tasks.some(t=>tasks.some(n=>n.id===t.id)));const index=ledger.tasks.findIndex(t=>t.id==='T39');ledger.tasks.splice(index,0,...tasks);ledger.tasks.find(t=>t.id==='T39').dependencies=['T38-FEED-FE'];
ledger.tasks.find(t=>t.id==='T06-FIX1').dependencies=['T00-REBASE-FEED'];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log('Reviewed amendment adopted; historic PASS/output/command evidence preserved; three feed tasks NOT_STARTED.');
