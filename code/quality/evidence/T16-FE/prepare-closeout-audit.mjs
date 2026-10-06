import fs from 'node:fs';
const source=fs.readFileSync('quality/evidence/T16-FE/codex-independent-audit.mjs','utf8');
const marker='const allowed=file=>';
if(!source.includes(marker))throw new Error('Audit marker missing');
fs.writeFileSync('quality/evidence/T16-FE/audit-after-prerequisite.mjs',source.replace(marker,"const approvedFix=ledger.tasks.find(t=>t.id==='T13-FIX1');assert.equal(approvedFix.status,'PASS');\nconst approvedFiles=new Set(Object.keys(approvedFix.outputsHash.files));\nconst allowed=file=>approvedFiles.has(file)||"));
const preflight=fs.readFileSync('quality/evidence/T13-FIX1/preflight.mjs','utf8').replaceAll("t.id==='T13-FIX1'","t.id==='T16-FE'").replace("'quality/evidence/T13-FIX1/record-check.mjs','preflight'","'quality/evidence/T16-FE/record-check.mjs','closeout-preflight'").replace("'T13-FIX1','apps/web/test/lobby.test.tsx'","'T16-FE','apps/web/test/presence.test.tsx'");
fs.writeFileSync('quality/evidence/T16-FE/closeout-preflight.mjs',preflight);
