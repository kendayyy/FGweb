import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-FE';
const label=process.argv[2];assert(/^[a-z0-9-]+$/.test(label??''));
const notesPath=process.argv[3];if(notesPath)assert(notesPath.startsWith(dir+'/')&&notesPath.endsWith('.md'));
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const ledgerBytes=fs.readFileSync('quality/tasks.json','utf8');
const ledger=JSON.parse(ledgerBytes);
const task=ledger.tasks.find(row=>row.id==='CHATCRYPTO-FE');assert.equal(task.status,'IN_PROGRESS');
const records=fs.readdirSync(dir).filter(file=>/^codex-.+\.json$/.test(file)).map(file=>{
  const record=JSON.parse(fs.readFileSync(`${dir}/${file}`,'utf8'));
  assert.equal(hash(record.evidencePath),record.evidenceSha256);assert(Number.isFinite(Date.parse(record.completedAt)));
  return {file:`${dir}/${file}`,record};
}).sort((a,b)=>a.record.startedAt.localeCompare(b.record.startedAt));
task.commands=records.filter(value=>value.record.exitCode===0).map(value=>value.record);
task.failedAttempts=records.filter(value=>value.record.exitCode!==0).map(value=>value.record);
task.evidencePaths=[...new Set([...task.evidencePaths,...records.flatMap(value=>[value.file,value.record.evidencePath])])];
const now=new Date();
const snapshot={recordedAt:now.toISOString(),task:task.id,status:task.status,successfulCommands:task.commands.length,failedAttempts:task.failedAttempts.length,records:records.map(value=>({path:value.file,sha256:hash(value.file)})),notesPath:notesPath??null,headedDeviceUiVerified:records.some(value=>value.file.endsWith('/codex-headed-device-5.json')&&value.record.exitCode===0),headedPrivateChatUiVerified:false,frontendComplete:false,mainMutation:false,productionActivation:false,next:'Complete private conversation/SAS/recovery/report/migration UI and headed integration; per-run counts are in preserved logs, not inferred from command totals'};
snapshot.headedPrivateChatUiVerified = records.some(value => /\/codex-headed-private-(3|4|5|6)\.json$/.test(value.file) && value.record.exitCode === 0);
snapshot.headedGroupUiVerified = records.some(value => value.file.endsWith('/codex-headed-group-4.json') && value.record.exitCode === 0);
fs.writeFileSync(`${dir}/checkpoint-${label}.json`,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
task.evidencePaths.push(`${dir}/checkpoint-${label}.json`);
for(let attempt=0;attempt<5;attempt++){
  assert.equal(fs.readFileSync('quality/tasks.json','utf8'),ledgerBytes,'Concurrent ledger edit; do not overwrite');
  try{fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');break;}
  catch(error){if(error.code!=='UNKNOWN'||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
}
if(notesPath){
  const notes=fs.readFileSync(notesPath,'utf8').trim().replace(/\r?\n+/g,' ');
  fs.appendFileSync('E:/FGweb/.doc/history.md',`\n- Coding and build 2 — CHATCRYPTO-FE — ${now.toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00: checkpoint ${label}, cùng phiên chưa kết thúc. ${notes} ${task.commands.length}successful/${task.failedAttempts.length}failed records preserved current evidence hashes; documented diagnostic redactions retain original hashes. Evidence code/${dir}/checkpoint-${label}.json và ${notesPath}; FE IN_PROGRESS, full private chat/frontend acceptance chưa hoàn thành, không main/production/later task/PASS.\n`);
}else{
fs.appendFileSync('E:/FGweb/.doc/history.md',`\n- Coding and build 2 — CHATCRYPTO-FE — ${now.toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00: checkpoint ${label}, cùng phiên chưa kết thúc. Native client RED11 do LOCKED thật → GREEN11; recovery native4 đúng/sai code/password-shape/no history trước import/fresh identity giữ nguyên đạt, recovery code không thay trust. Native SAS REDrequest/ready chứng minh HTTP transaction ID khác content flow ID; reviewed scope4files, giữ original snapshots/76PASS rows/checker/spec và native IDs. Shared guard conflation sửa; giữ strict public schema/from_device/private-field rejection, bổ sung valid-distinct/empty/number/foreign-device assertions. Native request/ready GREEN1 và contracts216/28 exit0; build1 exit0. Typecheck1 exit2 request.id optional, đã bổ sung guard, chưa rerun. Contractsregression1 exit1 config path doubled with --root; absolute config regression2 đạt. SASadoption1/2/3 thất bại bởi mutable Vitest cache/count assumption và external Telegram files; adoption4 exit0 actual gate,4reviewed source outputs chuyển ownership,10794other frozen files giữ nguyên;1Vitest mutable cache29entries không là bằng chứng28files run,3external tools/telegram-bridge files được quan sát/hash, không do FE ghi hoặc nằm historical PASS maps, giữ nguyên không restore. ${task.commands.length}successful/${task.failedAttempts.length}failed command records preserved exact hashes. Evidence code/${dir}/checkpoint-${label}.json và sas-adoption.json. FE IN_PROGRESS, chưa fullSAS/adapter/browser/headed UI, không main/production/later task/PASS.\n`);
}
console.log(JSON.stringify(snapshot));
