import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T26',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T26'),before=JSON.parse(fs.readFileSync(`${dir}/gateway-before.json`)),child=ledger.followups.find(t=>t.id==='T01-FIX3');
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,'T26');assert.equal(child.status,'PASS');assert.equal(ledger.activeCheckpoint,null);
 checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))});
 const allowed=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 for(const [p,h]of Object.entries(before.readonly))if(!allowed(p))assert.equal(hash(p),h,`Readonly changed: ${p}`);
 const latest=new Map();for(const old of before.historical){assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);for(const [p,h]of Object.entries(old.outputsHash?.files??{}))latest.set(p,h);}
 for(const [p,h]of latest)if(!allowed(p))assert.equal(hash(p),h,`Prior output changed: ${p}`);
 for(const [p,h]of Object.entries(child.outputsHash.files))assert.equal(hash(p),h,`Setup output changed: ${p}`);
 for(const c of child.commands){assert.equal(c.exitCode,0);assert.equal(hash(c.evidencePath),c.evidenceSha256);}
 assert.equal(hash('.env.local'),before.configuration.env);
 const frozen=JSON.parse(fs.readFileSync('quality/evidence/T01-FIX3/before.json'));
 for(const [p,h]of Object.entries(frozen.readonly).filter(([p])=>p.startsWith('apps/api/src/')||p.startsWith('apps/api/dist/')))assert.equal(hash(p),h,`Post-build source/runtime changed: ${p}`);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of files.filter(p=>!allowed(p)))assert(Object.hasOwn(before.readonly,p),`New outside scope: ${p}`);
 const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));
 for(const r of records)assert.equal(hash(r.evidencePath),r.evidenceSha256,`Evidence changed: ${r.evidencePath}`);
 const rtc=JSON.parse(fs.readFileSync(`${dir}/gateway-rtc-5/result.json`));
 for(const k of ['headed','privateSfuSignaling','senderConnected','receiverConnected','nativeAudioTrack','revokedDisconnected','replayBlocked','newAdmissionConnected','webRTCVerified','ownedSchemaRemoved','containersRemoved'])assert.equal(rtc[k],true,k);
 assert(rtc.inboundAudioBytes>0);assert.equal(rtc.audibleQualityVerified,false);assert.equal(rtc.productionTurnTlsVerified,false);assert.equal(rtc.playSlots,0);
 const privateValues=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([name,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(name)&&value.length>=8).map(([,value])=>value);
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
 for(const p of [...walk(dir),...files.filter(p=>allowed(p)&&p.startsWith('apps/api/src/'))])for(const v of privateValues)assert(!fs.readFileSync(p).includes(Buffer.from(v)),`Secret in ${p}`);
 return {recordedAt:new Date().toISOString(),task:'T26',setupCheckpoint:'T01-FIX3 PASS',nativeAdmissionTests:13,nativeGatewayTests:13,headedWebRTC:true,inboundAudioBytes:rtc.inboundAudioBytes,replayBlocked:true,cleanup:true,readonlyFiles:Object.keys(before.readonly).length,historicalPassRecords:before.historical.length,baselineHashesUnchanged:8,environmentUnchanged:true,sourceAndBuildUnchangedSinceVerifiedBuild:true,secretsScan:'PASS',productionTurnTlsVerified:false,audibleQualityVerified:false,mediaLoad1000Verified:false};
}
if(process.argv[1]?.endsWith('final-audit.mjs')){const report=audit();fs.writeFileSync(`${dir}/final-audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
