import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T28',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(nativeDir){
 assert(nativeDir?.startsWith(`${dir}/headed-`));
 const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T28'),before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,'T28');
 const amendment=JSON.parse(fs.readFileSync(`${dir}/pending-amendment.json`));
 assert.equal(amendment.currentCheckpoint,'T28');assert.equal(amendment.checkpointBaseline,task.specSha256);
 for(const source of Object.values(amendment.sources)){assert.equal(hash(source.livePath),source.liveSha256,'Approved amendment changed again');assert.equal(hash(source.frozenPath),source.frozenSha256,'Original approved snapshot changed');}
 assert.equal(checkBaselines({root:amendment.frozenRoot,baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
 const allowed=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 for(const [p,h]of Object.entries(before.readonly))if(!allowed(p))assert.equal(hash(p),h,`Readonly changed: ${p}`);
 const latest=new Map();for(const old of before.historical){assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);for(const [p,h]of Object.entries(old.outputsHash?.files??{}))latest.set(p,h);}
 for(const [p,h]of latest)if(!allowed(p))assert.equal(hash(p),h,`Prior output changed: ${p}`);
 const child=ledger.followups.find(t=>t.id==='T01-FIX3');assert.equal(child.status,'PASS');for(const [p,h]of Object.entries(child.outputsHash.files))assert.equal(hash(p),h);
 assert.equal(hash('.env.local'),before.configuration.env);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of files.filter(p=>!allowed(p)))assert(Object.hasOwn(before.readonly,p),`New outside scope: ${p}`);
 for(const p of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const r=JSON.parse(fs.readFileSync(`${dir}/${p}`));assert.equal(hash(r.evidencePath),r.evidenceSha256,`Evidence changed: ${p}`);}
 const rtc=JSON.parse(fs.readFileSync(`${nativeDir}/result.json`));
 for(const k of ['headed','actualFgApp','privateSfuSignaling','viewerMicrophone','localVolumeAndMute','deniedStillReceivesNativeAudio','themeAndMobilePreserveConnection','pendingPermissionLeave','routeCleanup','explicitLeavePreservesRoomAndTeam','passed'])assert.equal(rtc[k],true,k);
 assert(rtc.inboundAudioBytes>0);assert.equal(rtc.finalState.play_state,'ACTIVE');assert.equal(rtc.finalState.play_slots,1);assert.equal(rtc.finalState.open_calls,0);assert.equal(rtc.finalState.callers,0);
 const privateValues=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([name,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(name)&&value.length>=8).map(([,value])=>value);
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
 for(const p of [...walk(dir),...files.filter(p=>allowed(p)&&p.startsWith('apps/web/src/')),...walk('apps/web/dist')])for(const value of privateValues)assert(!fs.readFileSync(p).includes(Buffer.from(value)),`Secret in ${p}`);
 const fixtures=fs.readdirSync('.runtime/t28').filter(n=>n.startsWith('gateway-')).map(n=>`.runtime/t28/${n}`);
 for(const p of fixtures){assert(fs.existsSync(`${p}/cleanup.json`),`Fixture cleanup missing: ${p}`);const c=JSON.parse(fs.readFileSync(`${p}/cleanup.json`));assert.equal(c.containersRemoved,true);assert.equal(c.networkRemoved,true);}
 for(const p of fs.readdirSync(dir).filter(n=>n.startsWith('headed-'))){const c=JSON.parse(fs.readFileSync(`${dir}/${p}/cleanup.json`));for(const k of ['schemaRemoved','mediaRemoved','presenceRemoved','appClosed','webClosed'])assert.equal(c[k],true,`${p} ${k}`);}
 const provenance=JSON.parse(fs.readFileSync(`${dir}/fixture-provenance.json`));assert.equal(hash(provenance.source),provenance.sourceSha);assert.equal(hash(provenance.target),provenance.targetSha);
 return {recordedAt:new Date().toISOString(),task:'T28',readonlyFiles:Object.keys(before.readonly).length,historicalPassRecords:before.historical.length,originalApprovedSourcesVerified:8,liveApprovedAmendmentsPreserved:2,nextFeatureRequiresRebaseline:true,cryptoImplemented:false,environmentUnchanged:true,secretsScan:'PASS',ownedFixturesCleaned:fixtures.length,headedActualFgWebRTC:true,inboundAudioBytes:rtc.inboundAudioBytes,mediaLoad1000Verified:false,audibleQualityVerified:false,productionTurnTlsVerified:false};
}
if(process.argv[1]?.endsWith('final-audit.mjs')){const report=audit(process.argv[2]);fs.writeFileSync(`${dir}/final-audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
