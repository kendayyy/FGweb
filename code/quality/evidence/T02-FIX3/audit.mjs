import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T02-FIX3',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
export function audit(){
 const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
 const task=ledger.followups.find(t=>t.id==='T02-FIX3');
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.activeCheckpoint,task.id);
 assert.deepEqual(ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA'),before.parentSnapshot);
 for(const t of before.historical)assert.deepEqual(ledger.tasks.find(c=>c.id===t.id),t,t.id);
 for(const t of before.followups)assert.deepEqual(ledger.followups.find(c=>c.id===t.id),t,t.id);
 for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),h,p);
 assert.equal(hash('.env.local'),before.environmentSha256);
 assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
 const owned=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of files.filter(p=>!owned(p)))assert(Object.hasOwn(before.readonly,p),`New file outside setup scope: ${p}`);
 const transit=JSON.parse(fs.readFileSync(`${dir}/transit-result.json`));
 for(const key of ['tlsVerified','untrustedTlsDenied','transitRoundtrip','nonceRandomized','tamperDenied','appCannotManageKeys','appCannotReadReports','keyExportDenied','operatorRotationRewrap','restartPersistence','sealedDenied','outageDenied','appRoleSecretRevocation','auditPlaintextAbsent','cleanup'])assert.equal(transit[key],true,key);
 for(const key of ['mainDatabaseChanged','mainEnvironmentChanged','productionReady'])assert.equal(transit[key],false,key);
 const matrix=JSON.parse(fs.readFileSync(`${dir}/matrix-result.json`));
 for(const key of ['nativeTwoParty','ciphertextTamperDenied','crossRoomDenied','unverifiedNotShared','joinNoOldHistory','leaveRotatesAndRevokes','encryptedRecovery','wrongRecoveryDenied','newRecoveryDeviceIdentity','sasVerificationVerified'])assert.equal(matrix[key],true,key);
 assert(!matrix.cleanupFailure);assert.equal(matrix.productionAdapter,false);
 const browser=JSON.parse(fs.readFileSync(`${dir}/browser-result.json`));
 assert.equal(browser.headed,true);assert.equal(browser.wasmBrowserBuild,true);assert.equal(browser.initial.passed,true);assert.equal(browser.restored.passed,true);assert.equal(browser.restored.reloaded,true);
 assert.equal(browser.fgFeatureImplemented,false);
 const containers=execFileSync('docker',['ps','-a','--filter','label=fg.task=T02-FIX3','--format','{{.Names}}'],{encoding:'utf8'}).trim();assert.equal(containers,'','Owned fixture container leaked');
 const fixtureDirs=fs.readdirSync('.runtime/chatcrypto-setup').filter(p=>p.startsWith('transit-')||p.startsWith('browser-'));assert.equal(fixtureDirs.length,0,'Owned key fixture leaked');
 const values=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8).map(([,value])=>Buffer.from(value));
 for(const p of [...walk(dir),...walk('infra/chat-crypto')])for(const value of values)assert(!fs.readFileSync(p).includes(value),`Configured private value in evidence: ${p}`);
 for(const p of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const r=JSON.parse(fs.readFileSync(`${dir}/${p}`));assert.equal(hash(r.evidencePath),r.evidenceSha256,p);}
 return {recordedAt:new Date().toISOString(),checkpoint:task.id,manualSetupGate:true,baselines:8,parentWipFrozen:true,historicalPassRecords:before.historical.length,readonlyFiles:Object.keys(before.readonly).length,environmentUnchanged:true,secretsScan:'PASS',transitChecks:15,nativeMatrixChecks:10,browserWasmBuildAndPersistence:true,headed:true,ownedFixturesCleaned:true,fgEncryptionImplemented:false,productionReady:false};
}
if(process.argv[1]?.endsWith('audit.mjs')){const report=audit();fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
