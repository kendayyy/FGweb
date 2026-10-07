import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T03-FIX10',ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),index=ledger.tasks.findIndex(t=>t.id==='T23');
if(ledger.tasks.some(t=>t.id==='T03-FIX10'))throw Error('Already prepared');
const fields={specSha256:ledger.tasks[index].specSha256,inputsHash:null,outputsHash:null,commands:[],evidencePaths:[],startedAt:null,completedAt:null,blockers:[]};
ledger.tasks.splice(index,0,
 {...fields,id:'T03-FIX10',status:'IN_PROGRESS',dependencies:['T22'],startedAt:new Date().toISOString(),inputsHash:{head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()},writeAllowlist:['packages/contracts/src/teams.ts','packages/contracts/src/index.ts','packages/contracts/test/invitation-transport.test.ts','packages/contracts/dist/**','quality/api-contract.md',`${dir}/**`]},
 {...fields,id:'T06-FIX1',status:'NOT_STARTED',dependencies:['T03-FIX10'],writeAllowlist:['packages/database/src/schema/recruitments.ts','packages/database/migrations/0006_invitation_consent.sql','packages/database/migrations/meta/_journal.json','packages/database/migrations/meta/0006_snapshot.json','packages/database/test/invitation-consent.test.ts','packages/database/dist/**','quality/evidence/T06-FIX1/**']});
const next=ledger.tasks.find(t=>t.id==='T23');next.dependencies=['T06-FIX1'];next.writeAllowlist.push('apps/api/src/app.module.ts');
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
const task=ledger.tasks.find(t=>t.id==='T03-FIX10'),allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):p===f)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
fs.writeFileSync(`${dir}/readonly.json`,JSON.stringify(Object.fromEntries(files.filter(f=>!allow(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),null,2)+'\n');
fs.writeFileSync(`${dir}/record.mjs`,fs.readFileSync('quality/evidence/T22/record.mjs','utf8').replaceAll('T22','T03-FIX10'));
fs.writeFileSync(`${dir}/audit.mjs`,fs.readFileSync('quality/evidence/T03-FIX8/audit.mjs','utf8').replaceAll('T03-FIX8','T03-FIX10'));
fs.writeFileSync(`${dir}/plan.md`,'# Approved T03-FIX10\n\nUser explicitly approved T23/prerequisite-proposal.md. One task at a time: optional server consent timestamp; shared target-specific approval permissions; GET settings and PUT grant alias preserving old PATCH; describe private approval queue/current ACL. RED contracts -> minimal contracts -> full contracts/source-test lint/types/build/API-web consumer types/scope -> freeze PASS -> T06-FIX1. No producer, DB or frontend source changed here.\n');
console.log('Approved prerequisite tasks inserted; T03-FIX10 active, T06-FIX1 then T23.');
