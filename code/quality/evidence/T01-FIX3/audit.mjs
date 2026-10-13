import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T01-FIX3',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),seal=JSON.parse(fs.readFileSync(`${dir}/entry-seal.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
 const child=ledger.followups.find(t=>t.id==='T01-FIX3'),parent=ledger.tasks.find(t=>t.id==='T26');
 assert.equal(ledger.activeCheckpoint,'T01-FIX3');assert.equal(child.status,'IN_PROGRESS');assert.equal(parent.status,'BLOCKED');
 assert.deepEqual(parent,{...before.parentSnapshot,setupPrerequisiteCheckpoints:['T01-FIX3']});
 const allowed=p=>before.scope.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),seal.paths[p]??h,`Readonly changed: ${p}`);
 for(const [p,h]of Object.entries(seal.paths))assert.equal(hash(p),h,`Bootstrap changed: ${p}`);
 for(const prior of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===prior.id),prior);
 checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))});
 assert.equal(hash('.env.local'),before.configuration.env);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of files.filter(p=>!allowed(p)))assert(Object.hasOwn(before.readonly,p)||Object.hasOwn(seal.paths,p),`New outside scope: ${p}`);
 const rtc=JSON.parse(fs.readFileSync(`${dir}/rtc-1/result.json`));
 for(const key of ['headed','privateSfuSignaling','senderConnected','receiverConnected','nativeAudioTrack','revokedDisconnected','replayBlocked','newAdmissionConnected','webRTCVerified','ownedSchemaRemoved','containersRemoved'])assert.equal(rtc[key],true,key);
 assert(rtc.inboundAudioBytes>0);assert.equal(rtc.audibleQualityVerified,false);assert.equal(rtc.productionTurnTlsVerified,false);
 const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));
 for(const r of records)assert.equal(hash(r.evidencePath),r.evidenceSha256,`Evidence changed: ${r.evidencePath}`);
 const values=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([name,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(name)&&value.length>=8).map(([,value])=>value);
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
 for(const p of walk(dir))for(const value of values)assert(!fs.readFileSync(p).includes(Buffer.from(value)),`Private configuration leaked: ${p}`);
 return {recordedAt:new Date().toISOString(),checkpoint:'T01-FIX3',parent:'T26 BLOCKED',readonlyFiles:Object.keys(before.readonly).length,historicalPassRecords:before.historical.length,baselines:8,environmentUnchanged:true,privateSignaling:true,actualNativeSdkAudioRtpBytes:rtc.inboundAudioBytes,secretsScan:'PASS',manualSetupGate:true,checkerChanged:false};
}
if(process.argv[1]?.endsWith('audit.mjs')){const report=audit();fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
